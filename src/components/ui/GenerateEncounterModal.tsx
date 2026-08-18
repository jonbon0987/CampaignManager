// AI-driven full-encounter generator, shared by the campaign Encounter Builder
// and the world-level Combat view.
//
// Produces a complete encounter (name, scene description, difficulty,
// environment, DM tactics) plus its combatant roster. Creatures can be drawn
// from the DM's existing stat-sheet library, freshly invented by the AI, or a
// mix of both. Any invented creature is saved as a full stat sheet (so it gets
// a viewable "Sheet" in the encounter) and then linked into the encounter as a
// saved combatant.
//
// Scope-specific data (which stat sheets / encounters, how to save them, and
// how to build the context block) is injected via `deps`, so the same modal
// serves both the campaign and world scopes.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock, buildDefaultCampaignContextBlock } from '../../lib/campaignContext';
import {
  EntityContextPicker,
  useSelectedContextEntities,
  type ContextRef,
} from './EntityContextPicker';
import {
  creatureToInsert,
  resolveCombatants,
  pickDifficulty,
  type ResolvableCreature,
} from '../../lib/encounterGeneration';
import { DIFFICULTIES, type EncounterSaveData } from './EncounterDetail';
import type { Encounter, MonsterStatblock, MonsterStatblockInsert } from '../../lib/database.types';

type CreatureSource = 'library' | 'new' | 'both';
type ContextEntities = ReturnType<typeof useSelectedContextEntities>;

// Everything the generator needs that differs between campaign and world scope.
export interface EncounterGenDeps {
  statblocks: MonsterStatblock[];
  upsertStatblock: (insert: Omit<MonsterStatblockInsert, 'campaign_id'> & { id?: string }) => Promise<MonsterStatblock>;
  createEncounter: (data: EncounterSaveData) => Promise<Encounter>;
  encounterCount: number;
  buildContext: (entities: ContextEntities) => string;
  contextLabel: string;
  contextHint: string;
}

// ── Scope wrappers ─────────────────────────────────────────────────────────

export function GenerateEncounterModal(props: { isOpen: boolean; onClose: () => void; onCreated: (enc: Encounter) => void }) {
  const {
    monsterStatblocks, upsertMonsterStatblock,
    encounters, upsertEncounter,
    overview, sessions, hooks, locations,
  } = useCampaign();

  const deps: EncounterGenDeps = {
    statblocks: monsterStatblocks,
    upsertStatblock: upsertMonsterStatblock,
    createEncounter: (data) => upsertEncounter({ ...data, world_id: null }),
    encounterCount: encounters.length,
    buildContext: (entities) => entities.length > 0
      ? buildSelectedContextBlock(entities, { title: overview.title, plotSummary: overview.plotSummary })
      : buildDefaultCampaignContextBlock({
          overview: { title: overview.title, plotSummary: overview.plotSummary },
          sessions, hooks, locations,
        }),
    contextLabel: 'Campaign Context',
    contextHint: 'Add specific NPCs, threads, locations, factions, or lore to focus the encounter. Leave empty and it still draws on recent sessions and active threads.',
  };

  return <EncounterGenModal {...props} deps={deps} />;
}

export function GenerateWorldEncounterModal(props: { isOpen: boolean; onClose: () => void; onCreated: (enc: Encounter) => void }) {
  const { worldStatblocks, upsertWorldStatblock, worldEncounters, upsertWorldEncounter, activeWorld } = useWorld();

  const deps: EncounterGenDeps = {
    statblocks: worldStatblocks,
    upsertStatblock: (insert) => upsertWorldStatblock(insert),
    createEncounter: (data) => upsertWorldEncounter(data),
    encounterCount: worldEncounters.length,
    buildContext: (entities) => buildSelectedContextBlock(entities, {
      title: activeWorld?.name ?? '',
      plotSummary: activeWorld?.tagline ?? '',
    }),
    contextLabel: 'World Context',
    contextHint: 'Add specific NPCs, factions, locations, or lore so the encounter feels native to your world.',
  };

  return <EncounterGenModal {...props} deps={deps} />;
}

// ── Shared modal ───────────────────────────────────────────────────────────

function EncounterGenModal({
  isOpen,
  onClose,
  onCreated,
  deps,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (enc: Encounter) => void;
  deps: EncounterGenDeps;
}) {
  const { statblocks, upsertStatblock, createEncounter, encounterCount, buildContext, contextLabel, contextHint } = deps;
  const hasLibrary = statblocks.length > 0;

  const [partySize, setPartySize] = useState('4');
  const [partyLevel, setPartyLevel] = useState('');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('medium');
  const [theme, setTheme] = useState('');
  const [source, setSource] = useState<CreatureSource>(hasLibrary ? 'both' : 'new');
  const [selectedContext, setSelectedContext] = useState<ContextRef[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');
  const contextEntities = useSelectedContextEntities(selectedContext);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  // The library toggle can be unavailable; keep the effective source valid.
  const effectiveSource: CreatureSource = hasLibrary ? source : 'new';

  const reset = () => {
    setPartySize('4');
    setPartyLevel('');
    setDifficulty('medium');
    setTheme('');
    setSource(hasLibrary ? 'both' : 'new');
    setSelectedContext([]);
    setAdditionalContext('');
    setError('');
    setProgress('');
  };

  const close = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    const size = parseInt(partySize.trim(), 10);
    const level = parseInt(partyLevel.trim(), 10);
    if (!partySize.trim() || !partyLevel.trim()) {
      setError('Please enter both party size and average level.');
      return;
    }
    if (isNaN(size) || size < 1 || size > 10) {
      setError('Party size must be between 1 and 10.');
      return;
    }
    if (isNaN(level) || level < 1 || level > 20) {
      setError('Average level must be between 1 and 20.');
      return;
    }

    // ── Build the prompt ──────────────────────────────────────────────────
    const themeClause = theme.trim()
      ? `\n\nTheme / concept for this encounter: ${theme.trim()}.`
      : '';

    let sourceClause: string;
    if (effectiveSource === 'library') {
      sourceClause = `Build this encounter using ONLY creatures from the DM's library listed below. Reference each by its EXACT name in "combatants". Do NOT invent creatures; leave "new_creatures" as an empty array.`;
    } else if (effectiveSource === 'new') {
      sourceClause = `Invent brand-new creatures for this encounter. Provide a complete stat block for each one in "new_creatures", and reference them by their exact name in "combatants". Do NOT use the library; ignore any library listing.`;
    } else {
      sourceClause = `You may mix existing library creatures with brand-new invented ones. Reference library creatures by their EXACT name and do NOT repeat them in "new_creatures". For each brand-new creature, put a full stat block in "new_creatures" and reference it by exact name in "combatants". Use whichever mix makes the most interesting, balanced encounter.`;
    }

    const libraryListing = (effectiveSource !== 'new' && hasLibrary)
      ? `\n\nDM's creature library (reference these by exact name):\n${statblocks
          .map(m => `- "${m.name}" (${m.creature_type ?? 'creature'}, CR ${m.challenge_rating ?? '?'})`)
          .join('\n')}`
      : '';

    const contextBlock = buildContext(contextEntities);
    const additionalClause = additionalContext.trim()
      ? `\n\nAdditional DM instructions: ${additionalContext.trim()}`
      : '';

    const prompt = `You are designing a complete D&D 5e combat encounter for a party of ${size} player character(s) at average level ${level}. Target difficulty: ${difficulty}. Use the official D&D 5e encounter-building guidelines to choose creature challenge ratings and counts that land on that difficulty for this party.${themeClause}

${sourceClause}${libraryListing}${contextBlock}${additionalClause}

Respond with a single JSON object using this EXACT structure (no markdown, no commentary — just raw JSON):
{
  "name": "evocative encounter name",
  "description": "2-4 sentences of scene-setting the DM can read or paraphrase: where it happens, what the party sees, how the fight starts",
  "environment": "one of: Dungeon|Forest|Urban|Cave|Open|Underground|Aquatic|Aerial|Other",
  "difficulty": "${difficulty}",
  "dm_notes": "3-5 sentences of tactics, terrain features, pacing, and dramatic beats",
  "combatants": [
    { "name": "exact creature name", "count": 3, "notes": "optional role/positioning note, or empty string" }
  ],
  "new_creatures": [
    {
      "name": "...",
      "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
      "challenge_rating": "CR as a string, e.g. \\"1/4\\" or \\"5\\"",
      "armor_class": 15,
      "ac_descriptor": "optional, e.g. natural armor",
      "hit_points": 45,
      "hit_dice": "6d10+12",
      "speed": "30 ft., fly 60 ft.",
      "str": 14, "dex": 12, "con": 15, "int": 6, "wis": 10, "cha": 8,
      "saving_throws": "optional, e.g. Dex +4, Con +6",
      "skills": "optional, e.g. Perception +5, Stealth +4",
      "damage_resistances": "optional",
      "damage_immunities": "optional",
      "condition_immunities": "optional",
      "senses": "e.g. darkvision 60 ft., passive Perception 12",
      "languages": "optional",
      "content": "Full actions, bonus actions, reactions, legendary actions, and special traits as plain text. Do NOT repeat AC/HP/speed/ability scores here.",
      "tags": "comma-separated flavor tags",
      "dm_notes": "1-2 sentences of tactics for this creature"
    }
  ]
}

Every name in "combatants" MUST exactly match either a library creature (when allowed) or a "new_creatures" entry. Only include "new_creatures" you actually reference.`;

    setError('');
    setLoading(true);
    setProgress('Designing the encounter…');
    try {
      const res = await fetch('/api/generate-encounter', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as {
        name?: string;
        description?: string;
        environment?: string;
        difficulty?: string;
        dm_notes?: string;
        combatants?: Array<{ name?: string; count?: unknown; notes?: string }>;
        new_creatures?: Array<Record<string, unknown>>;
      };

      // ── Save any invented creatures as full library stat sheets ──────────
      const newCreatures = Array.isArray(parsed.new_creatures) ? parsed.new_creatures : [];
      const savedNew: ResolvableCreature[] = [];
      if (newCreatures.length > 0) {
        setProgress(`Saving ${newCreatures.length} new creature${newCreatures.length === 1 ? '' : 's'} to your library…`);
        let order = statblocks.length;
        for (const c of newCreatures) {
          const saved = await upsertStatblock(creatureToInsert(c, order++));
          savedNew.push({
            id: saved.id, name: saved.name,
            creature_type: saved.creature_type, challenge_rating: saved.challenge_rating,
          });
        }
      }

      // ── Resolve combatants (link to saved sheets where possible) ─────────
      const combatants = resolveCombatants(parsed.combatants, savedNew, statblocks);
      const validDifficulty = pickDifficulty(parsed.difficulty, difficulty, DIFFICULTIES) as EncounterSaveData['difficulty'];

      setProgress('Building the encounter…');
      const enc = await createEncounter({
        name: (parsed.name ?? '').trim() || 'Generated Encounter',
        description: parsed.description?.trim() || null,
        environment: parsed.environment?.trim() || null,
        difficulty: validDifficulty,
        party_size: size,
        party_level: level,
        dm_notes: parsed.dm_notes?.trim() || null,
        status: 'ready',
        combatants: combatants.length > 0 ? JSON.stringify(combatants) : null,
        sort_order: encounterCount,
      });

      reset();
      onCreated(enc);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const sourceOptions: Array<{ value: CreatureSource; label: string; hint: string }> = [
    { value: 'library', label: 'My Library', hint: 'Only use creatures I already have' },
    { value: 'new', label: 'Generate New', hint: 'Invent new creatures and save them as sheets' },
    { value: 'both', label: 'Both', hint: 'Mix existing and new creatures' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Generate Encounter"
      onSave={loading ? undefined : handleGenerate}
      saveLabel="Generate"
      wide
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
          The DM Assistant will design a full encounter — scene, tactics, and a
          balanced roster of creatures — scaled to your party.
        </p>

        {/* Party + difficulty */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Number of Players">
            <input
              type="number" min={1} max={10} value={partySize}
              onChange={e => { setPartySize(e.target.value); setError(''); }}
              placeholder="e.g. 4" style={inputStyle} autoFocus disabled={loading}
            />
          </FormField>
          <FormField label="Average Party Level">
            <input
              type="number" min={1} max={20} value={partyLevel}
              onChange={e => { setPartyLevel(e.target.value); setError(''); }}
              placeholder="e.g. 5" style={inputStyle} disabled={loading}
            />
          </FormField>
        </div>

        {/* Difficulty pills */}
        <div>
          <div style={{ color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px' }}>Difficulty</div>
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
            {DIFFICULTIES.map(d => (
              <button
                key={d} onClick={() => setDifficulty(d)} disabled={loading}
                className="flex-1 text-sm py-1.5 font-medium capitalize transition-colors"
                style={{
                  backgroundColor: difficulty === d ? 'var(--gold-dim)' : 'var(--paper)',
                  color: difficulty === d ? 'var(--gold)' : 'var(--ink-2)',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Creature source */}
        <div>
          <div style={{ color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px' }}>Creatures</div>
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
            {sourceOptions.map(opt => {
              const disabled = loading || (!hasLibrary && opt.value !== 'new');
              const active = effectiveSource === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSource(opt.value)}
                  disabled={disabled}
                  className="flex-1 text-sm py-1.5 font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--gold-dim)' : 'var(--paper)',
                    color: active ? 'var(--gold)' : 'var(--ink-2)',
                    opacity: disabled && !active ? 0.4 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
            {sourceOptions.find(o => o.value === effectiveSource)?.hint}
            {!hasLibrary && ' · your library is empty, so new creatures will be generated'}
          </p>
        </div>

        {/* Theme */}
        <FormField label="Theme / Concept (optional)">
          <input
            type="text" value={theme}
            onChange={e => setTheme(e.target.value)}
            placeholder="e.g. ambush in a fog-choked bog, cultists guarding a ritual"
            style={inputStyle} disabled={loading}
          />
        </FormField>

        {/* Context — pick the specific entities the AI should weave in */}
        <div>
          <EntityContextPicker
            selected={selectedContext}
            onChange={setSelectedContext}
            disabled={loading}
            label={contextLabel}
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
            {contextHint}
          </p>
        </div>

        {/* Additional context */}
        <FormField label="Additional Instructions (optional)">
          <textarea
            rows={3} value={additionalContext}
            onChange={e => setAdditionalContext(e.target.value)}
            placeholder="e.g. reinforcements arrive on round 3, the boss flees at half HP, avoid undead"
            style={textareaStyle} disabled={loading}
          />
        </FormField>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {loading && (
          <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
            {progress || 'Generating…'}
          </p>
        )}
      </div>
    </Modal>
  );
}
