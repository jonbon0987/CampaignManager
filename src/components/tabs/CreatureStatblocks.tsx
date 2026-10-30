import { useEffect, useState } from 'react';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { StatBlockText } from '../ui/StatBlockText';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock } from '../../lib/campaignContext';
import {
  EntityContextPicker,
  useSelectedContextEntities,
  type ContextRef,
} from '../ui/EntityContextPicker';
import { parsedToMonsterForm, statblockFieldsFromForm } from '../../lib/statblockCompletion';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import { ListDetail, ListRow, EmptyDetail, Pill } from '../ui/ListDetail';
import { StatSheetEditor } from '../entity/StatSheetEditor';
import type { MonsterStatblock } from '../../lib/database.types';

// --------------- Form type ---------------

export type MonsterForm = {
  name: string;
  creature_type: string;
  challenge_rating: string;
  armor_class: string;
  ac_descriptor: string;
  hit_points: string;
  hit_dice: string;
  speed: string;
  str: string;
  dex: string;
  con: string;
  int: string;
  wis: string;
  cha: string;
  saving_throws: string;
  skills: string;
  damage_immunities: string;
  damage_resistances: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  content: string;
  dm_notes: string;
  tags: string;
};

export const emptyMonsterForm = (): MonsterForm => ({
  name: '',
  creature_type: 'monstrosity',
  challenge_rating: '',
  armor_class: '',
  ac_descriptor: '',
  hit_points: '',
  hit_dice: '',
  speed: '',
  str: '',
  dex: '',
  con: '',
  int: '',
  wis: '',
  cha: '',
  saving_throws: '',
  skills: '',
  damage_immunities: '',
  damage_resistances: '',
  condition_immunities: '',
  senses: '',
  languages: '',
  content: '',
  dm_notes: '',
  tags: '',
});

// --------------- Helpers ---------------

export function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Standard 5e CR → proficiency bonus table
function profBonus(cr: string | null): string | null {
  if (!cr) return null;
  const crNum = cr === '1/8' ? 0.125 : cr === '1/4' ? 0.25 : cr === '1/2' ? 0.5 : Number(cr);
  if (Number.isNaN(crNum)) return null;
  if (crNum <= 4) return '+2';
  if (crNum <= 8) return '+3';
  if (crNum <= 12) return '+4';
  if (crNum <= 16) return '+5';
  if (crNum <= 20) return '+6';
  if (crNum <= 24) return '+7';
  if (crNum <= 28) return '+8';
  return '+9';
}

// Shared empty-state predicate used by the StatBlockPanel and view modal.
export function isStatBlockEmpty(m: MonsterStatblock): boolean {
  return !m.content && !m.dm_notes
    && m.armor_class == null && m.hit_points == null && !m.speed
    && m.str == null && m.dex == null && m.con == null
    && m.int == null && m.wis == null && m.cha == null
    && !m.saving_throws && !m.skills
    && !m.damage_resistances && !m.damage_immunities && !m.condition_immunities
    && !m.senses && !m.languages;
}

// --------------- Styles ---------------

const sectionLabel = {
  color: 'var(--gold)',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '0.4rem',
};

export const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'monstrosity', 'ooze', 'plant', 'undead', 'other',
];

// All valid D&D 5e challenge ratings
const VALID_CRS = new Set([
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
]);

export const ABILITY_KEYS: Array<{ key: keyof MonsterForm; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

// Ability score input cell. Module-scoped so its identity is stable across
// renders — defining it inside the editor remounted the <input> on every
// keystroke, which dropped focus after each character.
export function AbilityInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const score = parseInt(value, 10);
  const mod = !isNaN(score) ? abilityMod(score) : null;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <input
        type="number"
        min={1}
        max={30}
        value={value}
        onChange={onChange}
        placeholder="—"
        style={{ ...inputStyle, textAlign: 'center', padding: '4px 2px', width: '100%' }}
      />
      <div style={{ fontSize: '0.65rem', color: 'var(--ink-2)', marginTop: '3px', minHeight: '1em' }}>
        {mod ?? ''}
      </div>
    </div>
  );
}

// ================================================================
// Structured stat block viewer (shared by view modal and StatBlockPanel)
// ================================================================

export function StatBlockBody({ m }: { m: MonsterStatblock }) {
  const hasAbilityScores = m.str != null || m.dex != null || m.con != null || m.int != null || m.wis != null || m.cha != null;
  const hasDefenses = m.armor_class != null || m.hit_points != null || m.speed;
  const initiative = m.dex != null ? abilityMod(m.dex) : null;
  const proficiency = profBonus(m.challenge_rating);
  const hasTraits =
    initiative || proficiency ||
    m.saving_throws || m.skills || m.damage_resistances || m.damage_immunities || m.condition_immunities || m.senses || m.languages;

  const traitRow = (label: string, value: string | null) =>
    value ? (
      <div key={label} style={{ fontSize: '0.8rem', color: 'var(--ink)', lineHeight: '1.5' }}>
        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{label}: </span>
        {value}
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* AC / HP / Speed */}
      {hasDefenses && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {m.armor_class != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>{m.armor_class}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AC{m.ac_descriptor ? ` (${m.ac_descriptor})` : ''}
              </div>
            </div>
          )}
          {m.hit_points != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>
                {m.hit_points}{m.hit_dice ? ` (${m.hit_dice})` : ''}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>HP</div>
            </div>
          )}
          {m.speed && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>{m.speed}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</div>
            </div>
          )}
        </div>
      )}

      {/* Ability scores */}
      {hasAbilityScores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '8px 0' }}>
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(key => {
            const score = m[key];
            return (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                  {key.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)' }}>
                  {score ?? '—'}
                </div>
                {score != null && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--ink-2)' }}>{abilityMod(score)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trait rows */}
      {hasTraits && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {traitRow('Initiative', initiative)}
          {traitRow('Proficiency Bonus', proficiency)}
          {traitRow('Saving Throws', m.saving_throws)}
          {traitRow('Skills', m.skills)}
          {traitRow('Damage Resistances', m.damage_resistances)}
          {traitRow('Damage Immunities', m.damage_immunities)}
          {traitRow('Condition Immunities', m.condition_immunities)}
          {traitRow('Senses', m.senses)}
          {traitRow('Languages', m.languages)}
        </div>
      )}

      {/* Free-form actions / traits */}
      {m.content && (
        <div>
          <div style={sectionLabel}>Actions &amp; Traits</div>
          <StatBlockText
            as="pre"
            text={m.content}
            style={{
              color: 'var(--ink)',
              lineHeight: '1.7',
              fontFamily: 'var(--display)',
              fontSize: '0.85rem',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              padding: '12px',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          />
        </div>
      )}

      {/* DM Notes */}
      {m.dm_notes && (
        <div>
          <div style={sectionLabel}>DM Notes</div>
          <StatBlockText
            as="p"
            text={m.dm_notes}
            style={{
              color: 'var(--ink-2)',
              fontSize: '0.875rem',
              lineHeight: '1.6',
              fontStyle: 'italic',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export default function CreatureStatblocks({ onImportFromWorld, openId, onOpenConsumed }: { onImportFromWorld?: () => void; openId?: string | null; onOpenConsumed?: () => void }) {
  const { monsterStatblocks, upsertMonsterStatblock, deleteMonsterStatblock, overview } = useCampaign();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { openStatBlock, activeStatBlockId, closeStatBlock } = useStatBlockPanel();

  // Open the stat sheet requested from outside the tab (search).
  useEffect(() => {
    if (!openId) return;
    if (monsterStatblocks.some(x => x.id === openId)) { setSelectedId(openId); setSearch(''); setFilterType('all'); }
    onOpenConsumed?.();
  }, [openId, monsterStatblocks, onOpenConsumed]);

  // Generate modal state
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genContext, setGenContext] = useState<ContextRef[]>([]);
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const genContextEntities = useSelectedContextEntities(genContext);
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  // A new sheet is a draft until it has a name; its page opens straight away.
  const handleAdd = async () => {
    const m = await upsertMonsterStatblock({ ...statblockFieldsFromForm(emptyMonsterForm()), sort_order: monsterStatblocks.length, world_id: null });
    markDraft(m.id);
    setFilterType('all');
    setSearch('');
    setSelectedId(m.id);
  };

  const removeSheet = async (id: string) => {
    await deleteMonsterStatblock(id);
    if (activeStatBlockId === id) closeStatBlock();
  };

  const openGenModal = () => {
    setGenMode('cr');
    setGenCR('');
    setGenPartySize('');
    setGenPartyLevel('');
    setGenContext([]);
    setGenAdditionalContext('');
    setGenError('');
    setGenModalOpen(true);
  };

  const handleGenerate = async () => {
    let difficultyPrompt: string;

    if (genMode === 'cr') {
      const cr = genCR.trim();
      if (cr && !VALID_CRS.has(cr)) {
        setGenError(`"${cr}" is not a valid D&D 5e Challenge Rating. Valid values: 0, 1/8, 1/4, 1/2, 1–30.`);
        return;
      }
      difficultyPrompt = cr
        ? `CR ${cr}`
        : `a random challenge rating of your choosing (pick something interesting and varied)`;
    } else {
      const size = parseInt(genPartySize.trim(), 10);
      const level = parseInt(genPartyLevel.trim(), 10);
      if (!genPartySize.trim() || !genPartyLevel.trim()) {
        setGenError('Please enter both party size and average level.');
        return;
      }
      if (isNaN(size) || size < 1 || size > 10) {
        setGenError('Party size must be between 1 and 10.');
        return;
      }
      if (isNaN(level) || level < 1 || level > 20) {
        setGenError('Average level must be between 1 and 20.');
        return;
      }
      difficultyPrompt = `a difficulty appropriate for a party of ${size} players at average level ${level}. Use the D&D 5e encounter building guidelines to determine an appropriate CR for a hard or deadly solo boss fight against this party, then build the creature at that CR. The creature should feel like a memorable BBEG — give it legendary actions, legendary resistances if appropriate, and interesting abilities`;
    }

    const campaignContextBlock = buildSelectedContextBlock(genContextEntities, {
      title: overview.title,
      plotSummary: overview.plotSummary,
    });
    const additionalContextClause = genAdditionalContext.trim()
      ? `\n\nAdditional DM instructions: ${genAdditionalContext.trim()}`
      : '';

    const prompt = `Generate a complete D&D 5e creature stat block for ${difficultyPrompt}. Be creative with the name and flavor. Follow official D&D 5e stat block format exactly.${campaignContextBlock}${additionalContextClause}

Respond with a JSON object using this exact structure (no markdown, just raw JSON):
{
  "name": "...",
  "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
  "challenge_rating": "(the chosen CR as a string, e.g. \\"1/4\\" or \\"5\\")",
  "armor_class": (integer, e.g. 15),
  "ac_descriptor": "(optional string, e.g. \\"natural armor\\" or \\"chain mail\\" — omit if none)",
  "hit_points": (integer, e.g. 45),
  "hit_dice": "(hit dice string, e.g. \\"6d10+12\\")",
  "speed": "(speed string, e.g. \\"30 ft., fly 60 ft.\\")",
  "str": (integer 1-30),
  "dex": (integer 1-30),
  "con": (integer 1-30),
  "int": (integer 1-30),
  "wis": (integer 1-30),
  "cha": (integer 1-30),
  "saving_throws": "(e.g. \\"Dex +4, Con +6, Wis +3\\" — omit if none)",
  "skills": "(e.g. \\"Perception +5, Stealth +4\\" — omit if none)",
  "damage_resistances": "(e.g. \\"bludgeoning, piercing, and slashing from nonmagical attacks\\" — omit if none)",
  "damage_immunities": "(e.g. \\"fire, poison\\" — omit if none)",
  "condition_immunities": "(e.g. \\"charmed, frightened\\" — omit if none)",
  "senses": "(e.g. \\"darkvision 60 ft., passive Perception 15\\")",
  "languages": "(e.g. \\"Common, Draconic\\" — omit if none)",
  "content": "Full actions, bonus actions, reactions, legendary actions, and special traits as plain text. Do NOT repeat AC/HP/speed/ability scores here.",
  "tags": "comma-separated flavor tags (e.g. undead, boss, ranged)",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`;

    setGenError('');
    setGenLoading(true);
    try {
      const res = await fetch('/api/generate-creature', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      const m = await upsertMonsterStatblock({ ...statblockFieldsFromForm(parsedToMonsterForm(parsed)), sort_order: monsterStatblocks.length, world_id: null });
      setGenModalOpen(false);
      setFilterType('all');
      setSearch('');
      setSelectedId(m.id);
    } catch (err) {
      setGenError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenLoading(false);
    }
  };

  // Filtering
  const filtered = monsterStatblocks.filter(m => {
    const typeMatch = filterType === 'all' || m.creature_type === filterType;
    const searchLower = search.toLowerCase();
    const searchMatch = !search
      || m.name.toLowerCase().includes(searchLower)
      || (m.tags ?? '').toLowerCase().includes(searchLower)
      || (m.challenge_rating ?? '').toLowerCase().includes(searchLower);
    return typeMatch && searchMatch;
  });

  const usedTypes = Array.from(new Set(monsterStatblocks.map(m => m.creature_type ?? 'other'))).sort();

  const selected = monsterStatblocks.find(m => m.id === selectedId) ?? filtered[0] ?? null;

  return (
    <>
      <ListDetail
        title="Stat sheets"
        count={monsterStatblocks.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={() => void handleAdd()}
        addLabel="+ Add stat sheet"
        onGenerate={openGenModal}
        onImport={onImportFromWorld}
        filters={monsterStatblocks.length > 0 && (
          <>
            <Pill active={filterType === 'all'} onClick={() => setFilterType('all')}>All</Pill>
            {usedTypes.map(t => <Pill key={t} active={filterType === t} onClick={() => setFilterType(filterType === t ? 'all' : t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Pill>)}
          </>
        )}
        list={filtered.length === 0
          ? <div className="cm-empty is-inline">{monsterStatblocks.length === 0 ? 'No stat sheets yet. Add one, or generate one.' : 'No stat sheets match.'}</div>
          : filtered.map(m => (
            <ListRow key={m.id} active={selected?.id === m.id} onClick={() => setSelectedId(m.id)} glyph="◆"
              title={m.name || 'Unnamed creature'}
              subtitle={[m.creature_type ?? 'other', m.challenge_rating && `CR ${m.challenge_rating}`, m.hit_points != null && `${m.hit_points} HP`].filter(Boolean).join(' · ')} />
          ))}
        detail={selected ? (
          <StatSheetEditor
            key={selected.id}
            statblock={selected}
            scope="campaign"
            save={fields => upsertMonsterStatblock({ id: selected.id, ...fields, sort_order: selected.sort_order, world_id: selected.world_id })}
            remove={removeSheet}
            onDeleted={() => setSelectedId(null)}
            onView={() => openStatBlock(selected.id)}
          />
        ) : (
          <EmptyDetail>Select a stat sheet, or add one.</EmptyDetail>
        )}
      />

      {/* ================================================================
          GENERATE MODAL
      ================================================================ */}
      <Modal
        isOpen={genModalOpen}
        onClose={() => { if (!genLoading) setGenModalOpen(false); }}
        title="Generate Stat Sheet"
        onSave={genLoading ? undefined : handleGenerate}
        saveLabel="Generate"
      >
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
            {(['cr', 'party'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setGenMode(mode); setGenError(''); }}
                disabled={genLoading}
                className="flex-1 text-sm py-1.5 font-medium transition-colors"
                style={{
                  backgroundColor: genMode === mode ? 'var(--gold-dim)' : 'var(--paper)',
                  color: genMode === mode ? 'var(--gold)' : 'var(--ink-2)',
                }}
              >
                {mode === 'cr' ? 'By Challenge Rating' : 'By Party'}
              </button>
            ))}
          </div>

          {genMode === 'cr' ? (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
                Optionally enter a CR, or leave blank for a random difficulty.
              </p>
              <FormField label="Challenge Rating (optional)">
                <input
                  type="text"
                  value={genCR}
                  onChange={e => { setGenCR(e.target.value); setGenError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); } }}
                  placeholder="Leave blank for random, or e.g. 1/4, 5, 17"
                  style={inputStyle}
                  autoFocus
                  disabled={genLoading}
                />
              </FormField>
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Valid CRs: 0, 1/8, 1/4, 1/2, 1–30
              </div>
            </>
          ) : (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
                Enter your party details and the DM Assistant will build a boss stat sheet scaled to challenge them.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Number of Players">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={genPartySize}
                    onChange={e => { setGenPartySize(e.target.value); setGenError(''); }}
                    placeholder="e.g. 4"
                    style={inputStyle}
                    autoFocus
                    disabled={genLoading}
                  />
                </FormField>
                <FormField label="Average Party Level">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={genPartyLevel}
                    onChange={e => { setGenPartyLevel(e.target.value); setGenError(''); }}
                    placeholder="e.g. 5"
                    style={inputStyle}
                    disabled={genLoading}
                  />
                </FormField>
              </div>
            </>
          )}

          {/* Campaign context — pick the specific entities the AI should weave in */}
          <div>
            <EntityContextPicker
              selected={genContext}
              onChange={setGenContext}
              disabled={genLoading}
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Add specific NPCs, threads, locations, factions, or lore so the stat sheet feels native to your campaign.
            </p>
          </div>

          {/* Additional context */}
          <FormField label="Additional Context (optional)">
            <textarea
              rows={3}
              value={genAdditionalContext}
              onChange={e => setGenAdditionalContext(e.target.value)}
              placeholder="e.g. This stat sheet has multiple stages and legendary actions, transforms mid-fight, etc"
              style={textareaStyle}
              disabled={genLoading}
            />
          </FormField>

          {genError && (
            <p className="text-sm" style={{ color: 'var(--red)' }}>{genError}</p>
          )}
          {genLoading && (
            <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
              Generating stat block…
            </p>
          )}
        </div>
      </Modal>

    </>
  );
}
