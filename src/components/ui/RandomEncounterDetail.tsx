// Shared random-table builder + roller — used by the campaign RandomEncounters
// tab and the world-level WorldCombatView. A weighted table (any die d4–d100) of
// a given kind (encounter / treasure / magic / wild / custom); entry weights map
// to live roll odds. Encounter tables additionally link creatures, take party
// settings, and roll into a party-scaled combat (or social) result that can be
// saved to Encounters or run in the Initiative Tracker.

import { useState, useEffect, useMemo, useRef } from 'react';
import { TitleInput } from './TitleInput';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from './OverflowMenu';
import { SlashField } from './SlashField';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { limitFor } from '../../lib/fieldLimits';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildEntryPrompt, parseGeneratedEntry } from '../../lib/randomTableGeneration';
import {
  RANDOM_TABLE_KINDS,
  DIE_SIZES,
  RARITIES,
  RARITY_WEIGHTS,
  usesRarity,
  kindMeta,
  parseEntries,
  weightedRanges,
  rollWeighted,
  normalizeDie,
  defaultRandomEntry,
} from '../../lib/randomEncounter';
import {
  DIFFICULTIES,
  buildCombat,
  buildSocial,
  synthCreature,
  type Difficulty,
  type ScaleCreature,
  type CombatResult,
  type SocialResult,
} from '../../lib/encounterScaling';
import type { EncounterSaveData } from '../../lib/encounters';
import type { RandomEncounterTable, RandomEncounterEntry, MonsterStatblock, EncounterCombatant } from '../../lib/database.types';
import { difficultyColor, randomEntryTypeColors } from '../../lib/theme';
import './randomTables.css';

// Data the save callback receives — the caller injects world_id / campaign_id.
export type RandomEncounterSaveData = {
  id?: string;
  kind: string;
  name: string;
  subtitle: string | null;
  environment: string | null;
  die_size: number;
  description: string | null;
  entries: string | null;
  dm_notes: string | null;
  sort_order: number;
};

type Form = {
  kind: string;
  name: string;
  subtitle: string;
  environment: string;
  die_size: number;
  description: string;
  dm_notes: string;
};

type RollParams = { size: number; level: number; difficulty: Difficulty; socialBias: number; autoGenerate: boolean };

function formFromTable(t: RandomEncounterTable): Form {
  return {
    kind: t.kind || 'encounter',
    name: t.name,
    subtitle: t.subtitle ?? '',
    environment: t.environment ?? '',
    die_size: normalizeDie(t.die_size),
    description: t.description ?? '',
    dm_notes: t.dm_notes ?? '',
  };
}

// Party size / avg level / difficulty / social dial — shared by the builder's
// roll bar and the result view's "Adjust & re-roll" panel.
function RollParamsControls({ params, onChange }: { params: RollParams; onChange: (p: RollParams) => void }) {
  return (
    <div className="rnd-params">
      <label className="rnd-param">
        <span className="as-ml">Party size</span>
        <input type="number" min={1} max={10} value={params.size}
          onChange={e => onChange({ ...params, size: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="as-input rnd-param-num" />
      </label>
      <label className="rnd-param">
        <span className="as-ml">Avg level</span>
        <input type="number" min={1} max={20} value={params.level}
          onChange={e => onChange({ ...params, level: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="as-input rnd-param-num" />
      </label>
      <div className="rnd-param">
        <span className="as-ml">Difficulty</span>
        <div className="rnd-diff-group">
          {DIFFICULTIES.map(d => {
            const on = params.difficulty === d;
            return (
              <button key={d} onClick={() => onChange({ ...params, difficulty: d })}
                className="rnd-diff-btn" style={{ color: on ? 'var(--bg)' : 'var(--ink-3)', backgroundColor: on ? difficultyColor(d) : 'transparent', border: `1px solid ${on ? difficultyColor(d) : 'var(--rule)'}` }}>{d}</button>
            );
          })}
        </div>
      </div>
      <div className="rnd-param rnd-param-bias">
        <div className="rnd-bias-ends">
          <span className="as-ml">⚔ Combat</span><span className="as-ml">Social ◇</span>
        </div>
        <input type="range" min={0} max={100} value={Math.round(params.socialBias * 100)}
          onChange={e => onChange({ ...params, socialBias: (parseInt(e.target.value, 10) || 0) / 100 })}
          className="rnd-accent" />
        <span className="rnd-bias-note">
          ≈ {Math.round(params.socialBias * 100)}% chance of a social encounter
        </span>
      </div>
      <label className="rnd-param-auto">
        <input
          type="checkbox"
          checked={params.autoGenerate}
          onChange={e => onChange({ ...params, autoGenerate: e.target.checked })}
          className="rnd-accent"
        />
        <span className="rnd-param-auto-text">
          Auto-generate a creature for entries with none linked
        </span>
      </label>
    </div>
  );
}

export function RandomEncounterDetail({
  table,
  scope,
  onDelete,
  upsertTable,
  statblocks = [],
  party,
  onViewStatblock,
  onSaveEncounter,
  onRunEncounter,
}: {
  table: RandomEncounterTable;
  scope: 'world' | 'campaign';
  onDelete: () => void;
  upsertTable: (data: RandomEncounterSaveData) => Promise<RandomEncounterTable>;
  statblocks?: MonsterStatblock[];
  party?: { size: number; level: number };
  onViewStatblock?: (sb: MonsterStatblock) => void;
  onSaveEncounter?: (data: EncounterSaveData) => Promise<unknown> | void;
  onRunEncounter?: (data: EncounterSaveData) => Promise<unknown> | void;
}) {
  const [form, setForm] = useState<Form>(() => formFromTable(table));
  const [entries, setEntries] = useState<RandomEncounterEntry[]>(() => parseEntries(table.entries));
  const [rolled, setRolled] = useState<{ roll: number; lo: number; hi: number; entryId: string | null } | null>(null);
  const [built, setBuilt] = useState<CombatResult | SocialResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [rollParams, setRollParams] = useState<RollParams>(() => ({
    size: party?.size || 4, level: party?.level || 5, difficulty: 'medium', socialBias: 0.35, autoGenerate: true,
  }));

  const isEncounter = form.kind === 'encounter';

  useEffect(() => {
    setForm(formFromTable(table));
    setEntries(parseEntries(table.entries));
    setRolled(null); setBuilt(null); setSaved(false);
  }, [table.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status: saveStatus, saveNow } = useAutoSave({
    data: { form, entries },
    delay: 800,
    enabled: true,
    onSave: async ({ form: f, entries: e }) => {
      await upsertTable({
        id: table.id,
        kind: f.kind,
        name: f.name.trim() || 'Untitled Table',
        subtitle: f.subtitle || null,
        environment: f.environment || null,
        die_size: f.die_size,
        description: f.description || null,
        entries: e.length > 0 ? JSON.stringify(e) : '[]',
        dm_notes: f.dm_notes || null,
        sort_order: table.sort_order,
      });
    },
  });

  const meta = kindMeta(form.kind);
  const ranges = weightedRanges(entries, form.die_size);
  const rangeFor = (id: string) => ranges.find(r => r.id === id) ?? null;
  const sbById = useMemo(() => new Map(statblocks.map(s => [s.id, s])), [statblocks]);

  const setEntry = (id: string, patch: Partial<RandomEncounterEntry>) =>
    setEntries(prev => prev.map(en => (en.id === id ? { ...en, ...patch } : en)));
  const setRarity = (id: string, rarity: string) =>
    setEntry(id, { rarity, weight: RARITY_WEIGHTS[rarity] ?? 1 });
  const removeEntry = (id: string) => setEntries(prev => prev.filter(en => en.id !== id));
  const addRow = () => setEntries(prev => [...prev, {
    ...defaultRandomEntry(),
    ...(isEncounter ? { entryKind: 'combat' as const, creatures: [] } : {}),
  }]);

  // ── AI: suggest one entry appropriate to this table's kind + region ──
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const bestiaryByName = useMemo(
    () => new Map(statblocks.map(s => [s.name.toLowerCase().trim(), s.id])),
    [statblocks],
  );
  const suggestEntry = async () => {
    setSuggesting(true);
    setSuggestError('');
    try {
      const prompt = buildEntryPrompt({
        kind: form.kind,
        tableName: form.name,
        region: form.environment,
        existingNames: entries.map(e => e.name).filter(Boolean),
        bestiaryNames: statblocks.map(s => s.name),
      });
      const res = await fetch('/api/generate-encounter', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);
      const entry = parseGeneratedEntry(form.kind, data.text ?? '', bestiaryByName);
      setEntries(prev => [...prev, entry]);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Suggestion failed.');
    } finally {
      setSuggesting(false);
    }
  };

  const resolveCreatures = (entry: RandomEncounterEntry, p: RollParams): ScaleCreature[] => {
    const linked = (entry.creatures ?? [])
      .map((c): ScaleCreature | null => {
        const sb = sbById.get(c.id);
        return sb ? { id: sb.id, name: sb.name, cr: sb.challenge_rating, dmNotes: sb.dm_notes, note: c.note } : null;
      })
      .filter((x): x is ScaleCreature => x !== null);
    if (linked.length > 0) return linked;
    // No linked creatures: only improvise one when auto-generate is enabled.
    return p.autoGenerate ? [synthCreature(entry.name || 'Foe', p.level)] : [];
  };

  // Build (or re-scale) the encounter for an entry at the given params. When
  // `prev` is a combat result, its battlefield/complication flavor is preserved
  // so adjusting party/difficulty re-scales the roster without reshuffling the
  // scene; a fresh roll passes no `prev` and gets new flavor.
  const buildEntry = (
    entry: RandomEncounterEntry,
    p: RollParams,
    prev?: CombatResult | SocialResult | null,
  ): CombatResult | SocialResult => {
    const wantSocial = entry.entryKind === 'social' || (entry.entryKind === 'either' && p.socialBias > 0.6);
    const sp = { partySize: p.size, partyLevel: p.level, difficulty: p.difficulty, socialBias: p.socialBias };
    if (wantSocial) return buildSocial({ title: entry.name || 'Encounter', scene: entry.description }, sp);
    const fresh = buildCombat(
      { title: entry.name || 'Encounter', scene: entry.description, creatures: resolveCreatures(entry, p), regionHint: `${form.environment} ${form.name}` },
      sp,
    );
    return prev && prev.mode === 'combat'
      ? { ...fresh, terrain: prev.terrain, complication: prev.complication }
      : fresh;
  };

  const roll = () => {
    if (entries.length === 0) return;
    setSaved(false);
    const { roll: r, entry, range } = rollWeighted(entries, form.die_size);
    setRolled({ roll: r, lo: range?.lo ?? r, hi: range?.hi ?? r, entryId: entry?.id ?? null });
    setBuilt(isEncounter && entry ? buildEntry(entry, rollParams) : null);
  };

  // Result-view "Adjust": change roll params and re-scale the current result live.
  const adjustParams = (next: RollParams) => {
    setSaved(false);
    setRollParams(next);
    const entry = rolled ? entries.find(e => e.id === rolled.entryId) ?? null : null;
    if (isEncounter && entry) setBuilt(prev => buildEntry(entry, next, prev));
  };

  const toEncounterSaveData = (r: CombatResult): EncounterSaveData => {
    const combatants: EncounterCombatant[] = r.roster.map(row => {
      const isSynth = row.creature.id.startsWith('synth-') || !sbById.has(row.creature.id);
      return {
        id: crypto.randomUUID(),
        source: isSynth ? 'custom' : 'saved',
        statblock_id: isSynth ? null : row.creature.id,
        name: row.creature.name,
        creature_type: null,
        challenge_rating: row.creature.cr,
        count: row.count,
        notes: row.note,
      };
    });
    const dmNotes = [
      r.tactics && `Tactics: ${r.tactics}`,
      `Battlefield — ${r.terrain.name}: ${r.terrain.text}`,
      `Complication — ${r.complication.name}: ${r.complication.text}`,
      `Loot — ${r.loot.coins}; ${r.loot.find}${r.loot.item ? `; ${r.loot.item}` : ''}.`,
    ].filter(Boolean).join('\n\n');
    return {
      name: r.title || 'Random encounter',
      description: r.scene || null,
      environment: form.environment || null,
      difficulty: r.tier,
      party_size: rollParams.size,
      party_level: rollParams.level,
      dm_notes: dmNotes,
      status: 'ready',
      combatants: combatants.length > 0 ? JSON.stringify(combatants) : null,
      sort_order: Math.floor(Date.now() / 1000),
    };
  };

  const rarityMode = usesRarity(form.kind);
  const rolledEntry = rolled ? entries.find(e => e.id === rolled.entryId) ?? null : null;

  // ── Result view (any kind) ──
  if (rolled) {
    return (
      <RollResultView
        kind={form.kind}
        entry={rolledEntry}
        result={built}
        roll={rolled.roll}
        landed={`${rolled.lo}–${rolled.hi}`}
        die={form.die_size}
        params={rollParams}
        onParamsChange={adjustParams}
        sbById={sbById}
        onViewStatblock={onViewStatblock}
        onBack={() => { setRolled(null); setBuilt(null); }}
        onReroll={roll}
        saved={saved}
        onSave={onSaveEncounter && built?.mode === 'combat'
          ? async () => { await onSaveEncounter(toEncounterSaveData(built)); setSaved(true); }
          : undefined}
        onRun={onRunEncounter && built?.mode === 'combat'
          ? () => onRunEncounter(toEncounterSaveData(built))
          : undefined}
      />
    );
  }

  return (
    <div className="rnd-builder">
      {/* ── Action bar ── */}
      <div className="as-bar rnd-spaced">
        <SaveStatusIndicator status={saveStatus} onRetry={saveNow} />
        <div className="as-spacer" />
        <button
          onClick={roll}
          disabled={entries.length === 0}
          title={entries.length === 0 ? 'Add rows first' : `Roll d${form.die_size}`}
          className="rnd-roll-btn" style={{ color: entries.length === 0 ? 'var(--ink-4)' : 'var(--bg)', backgroundColor: entries.length === 0 ? 'var(--bg-2)' : 'var(--gold)', border: `1px solid ${entries.length === 0 ? 'var(--rule)' : 'var(--gold)'}`, cursor: entries.length === 0 ? 'default' : 'pointer' }}
        >
          ⚄ Roll d{form.die_size}
        </button>
        <OverflowMenu items={[
          { label: 'Delete table', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* ── Eyebrow ── */}
      <div className="rnd-eyebrow">
        {meta.label} Table · {scope === 'world' ? 'World' : 'Campaign'}
      </div>

      {/* ── Title + subtitle ── */}
      <TitleInput
        value={form.name}
        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Name this table…"
        maxLength={limitFor('random_encounter_tables', 'name')}
        className="as-title rnd-title-input"
      />
      <input
        className="as-sub rnd-subtitle-input"
        value={form.subtitle}
        onChange={e => setForm(prev => ({ ...prev, subtitle: e.target.value }))}
        placeholder="A line of flavor — where and when this table applies…"
        maxLength={limitFor('random_encounter_tables', 'subtitle')}
      />

      {/* ── Meta strip ── */}
      <div className="as-meta rnd-spaced">
        <div className="as-mi">
          <div className="as-ml">Kind</div>
          <select className="as-select" value={form.kind}
            onChange={e => { setForm(prev => ({ ...prev, kind: e.target.value })); setRolled(null); setBuilt(null); }}>
            {RANDOM_TABLE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <div className="as-ml">Region</div>
          <input className="as-input rnd-env-input" value={form.environment}
            onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))}
            placeholder="Anywhere" maxLength={limitFor('random_encounter_tables', 'environment')} />
        </div>
        <div className="as-mi">
          <div className="as-ml">Die</div>
          <select className="as-select" value={form.die_size}
            onChange={e => setForm(prev => ({ ...prev, die_size: parseInt(e.target.value, 10) }))}>
            {DIE_SIZES.map(d => <option key={d} value={d}>d{d}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <div className="as-ml">Weighting</div>
          <span className="rnd-die">
            d{form.die_size} · weighted
          </span>
        </div>
      </div>

      {/* ── Roll settings (encounter kind) ── */}
      {isEncounter && (
        <div className="rnd-rollbar">
          <RollParamsControls params={rollParams} onChange={setRollParams} />
        </div>
      )}

      {/* ── Entries ── */}
      <div className="rnd-block">
        <div className="rnd-entries-head">
          <div className="rnd-entries-title">
            Entries
          </div>
          <div className="rnd-grow" />
          <div className="rnd-entries-count">
            weights → roll odds
          </div>
        </div>

        {entries.length === 0 && (
          <p className="text-xs rnd-entries-hint">
            No entries yet — add rows to build the table.
          </p>
        )}

        <div className="space-y-2">
          {entries.map((en, i) => (
            <EntryRow
              key={en.id}
              entry={en}
              idx={i + 1}
              range={rangeFor(en.id)}
              rolled={false /* builder only renders pre-roll; the result view handles the rolled state */}
              kind={form.kind}
              rarityMode={rarityMode}
              statblocks={statblocks}
              sbById={sbById}
              onPatch={patch => setEntry(en.id, patch)}
              onSetRarity={r => setRarity(en.id, r)}
              onRemove={() => removeEntry(en.id)}
              onViewStatblock={onViewStatblock}
            />
          ))}
        </div>

        <div className="rnd-entry-actions">
          <button
            onClick={addRow}
            className="text-xs px-3 py-1.5 rounded rnd-btn-plain"
          >
            + Add entry
          </button>
          <button
            onClick={suggestEntry}
            disabled={suggesting}
            title="Let the DM Assistant write one entry for this table"
            className="text-xs px-3 py-1.5 rounded rnd-btn-arcane"
            style={{ cursor: suggesting ? 'default' : 'pointer', opacity: suggesting ? 0.7 : 1 }}
          >
            {suggesting ? 'Suggesting…' : '✦ Suggest an entry'}
          </button>
          {suggestError && <span className="rnd-error">{suggestError}</span>}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="as-fl rnd-block">
        <div className="as-ll">Notes for this table</div>
        <SlashField value={form.description} onChange={v => setForm(prev => ({ ...prev, description: v }))}
          placeholder="How and when this table applies, pacing, tie-ins…"
          maxLength={limitFor('random_encounter_tables', 'description')} />
      </div>
      <div className="as-fl rnd-block">
        <div className="as-ll">DM Notes</div>
        <SlashField value={form.dm_notes} onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))}
          placeholder="Private notes — escalation, secrets, follow-ups…"
          maxLength={limitFor('random_encounter_tables', 'dm_notes')} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Entry row
// ════════════════════════════════════════════════════════════

function EntryRow({
  entry, idx, range, rolled, kind, rarityMode, statblocks, sbById,
  onPatch, onSetRarity, onRemove, onViewStatblock,
}: {
  entry: RandomEncounterEntry;
  idx: number;
  range: { lo: number; hi: number; pct: number } | null;
  rolled: boolean;
  kind: string;
  rarityMode: boolean;
  statblocks: MonsterStatblock[];
  sbById: Map<string, MonsterStatblock>;
  onPatch: (patch: Partial<RandomEncounterEntry>) => void;
  onSetRarity: (rarity: string) => void;
  onRemove: () => void;
  onViewStatblock?: (sb: MonsterStatblock) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isEncounter = kind === 'encounter';
  const entryKind = entry.entryKind ?? 'combat';
  const creatures = entry.creatures ?? [];

  const cycleType = () => {
    const order: ('combat' | 'social' | 'either')[] = ['combat', 'social', 'either'];
    onPatch({ entryKind: order[(order.indexOf(entryKind) + 1) % 3] });
  };
  const linkCreature = (sb: MonsterStatblock) => {
    if (!creatures.some(c => c.id === sb.id)) onPatch({ creatures: [...creatures, { id: sb.id, note: null }] });
    setPickerOpen(false);
  };
  const unlink = (id: string) => onPatch({ creatures: creatures.filter(c => c.id !== id) });

  return (
    <div
      className="rnd-entry" style={{ backgroundColor: rolled ? 'var(--arcane-bg)' : 'var(--bg)', border: `1px solid ${rolled ? 'var(--arcane-line)' : 'var(--rule)'}` }}
    >
      <div className="rnd-entry-range">{idx}</div>

      <div className="rnd-entry-main">
        <input
          type="text" value={entry.name}
          onChange={e => onPatch({ name: e.target.value })}
          placeholder="Result name…"
          className="rnd-entry-name"
          aria-label="Result name"
        />
        <textarea
          value={entry.description} rows={2}
          onChange={e => onPatch({ description: e.target.value })}
          placeholder="A brief description the DM reads or paraphrases…"
          className="rnd-entry-text"
          aria-label="Result description"
        />

        {/* Encounter meta: type tag + linked creatures */}
        {isEncounter && (
          <div className="rnd-entry-links">
            <button
              onClick={cycleType}
              title="Click to cycle combat / social / either"
              className="rnd-type-tag" style={{ color: randomEntryTypeColors[entryKind], border: `1px solid ${randomEntryTypeColors[entryKind]}` }}
            >{entryKind}</button>

            {creatures.map(c => {
              const sb = sbById.get(c.id);
              if (!sb) return null;
              return (
                <span key={c.id}
                  onClick={() => onViewStatblock?.(sb)}
                  className="rnd-creature" style={{ cursor: onViewStatblock ? 'pointer' : 'default' }}
                >
                  {sb.name}
                  {sb.challenge_rating && <span className="rnd-cr">CR {sb.challenge_rating}</span>}
                  <span onClick={e => { e.stopPropagation(); unlink(c.id); }} className="rnd-unlink">✕</span>
                </span>
              );
            })}

            <div className="rnd-anchor">
              <button
                onClick={() => setPickerOpen(o => !o)}
                className="rnd-add-creature"
              >+ link creature</button>
              {pickerOpen && (
                <CreaturePicker statblocks={statblocks} onPick={linkCreature} onClose={() => setPickerOpen(false)} />
              )}
            </div>

          </div>
        )}

        {/* Treasure fields */}
        {kind === 'treasure' && (
          <div className="rnd-haul-grid">
            <input type="text" value={entry.coins ?? ''} onChange={e => onPatch({ coins: e.target.value })}
              placeholder="Coin — e.g. 4d6 × 100 gp" className="as-input rnd-input-sm" aria-label="Coin" />
            <input type="text" value={entry.valuables ?? ''} onChange={e => onPatch({ valuables: e.target.value })}
              placeholder="Valuables" className="as-input rnd-input-sm" aria-label="Valuables" />
            <input type="text" value={entry.magicItem ?? ''} onChange={e => onPatch({ magicItem: e.target.value })}
              placeholder="Magic item" className="as-input rnd-input-sm" aria-label="Magic item" />
          </div>
        )}

        {/* Magic Item fields */}
        {kind === 'magic' && (
          <div className="rnd-item">
            <div className="rnd-item-row">
              <input type="text" value={entry.itemType ?? ''} onChange={e => onPatch({ itemType: e.target.value })}
                placeholder="Item type — e.g. Wondrous item" className="as-input rnd-input-sm rnd-grow" aria-label="Item type" />
              <label className="rnd-attune">
                <input type="checkbox" checked={!!entry.attunement} onChange={e => onPatch({ attunement: e.target.checked })} />
                Attunement
              </label>
            </div>
            <textarea value={entry.itemText ?? ''} rows={2} onChange={e => onPatch({ itemText: e.target.value })}
              placeholder="Item text — what it does…"
              className="rnd-entry-note"
              aria-label="Item text" />
          </div>
        )}

        {/* Wild Magic field */}
        {kind === 'wild' && (
          <textarea value={entry.effect ?? ''} rows={2} onChange={e => onPatch({ effect: e.target.value })}
            placeholder="Surge effect…"
            className="rnd-entry-effect"
            aria-label="Surge effect" />
        )}

        {/* Custom card kind */}
        {kind === 'custom' && (
          <div className="rnd-card-row">
            <span className="as-ml">Card</span>
            <select className="as-select rnd-select-sm" value={entry.cardKind ?? ''}
              onChange={e => onPatch({ cardKind: (e.target.value || undefined) as RandomEncounterEntry['cardKind'] })} aria-label="Card kind">
              <option value="">Read-aloud (no card)</option>
              <option value="fortune">Fortune (good)</option>
              <option value="doom">Doom (bad)</option>
            </select>
          </div>
        )}
      </div>

      {/* Weight control + live odds */}
      <div>
        <div className="rnd-weight-row">
          {rarityMode ? (
            <select className="as-select rnd-select-sm" value={entry.rarity ?? 'common'} onChange={e => onSetRarity(e.target.value)} aria-label="Rarity">
              {RARITIES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          ) : (
            <div className="rnd-weight">
              <span className="rnd-weight-label">weight</span>
              <input type="number" min={1} value={entry.weight}
                onChange={e => onPatch({ weight: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="as-input rnd-weight-input" aria-label="Weight" />
            </div>
          )}
          <span className="rnd-weight-pct">
            {range ? Math.round(range.pct * 100) : 0}%
          </span>
        </div>
        <div className="rnd-odds-track">
          <div className="rnd-odds-bar" style={{ width: `${range ? range.pct * 100 : 0}%` }} />
        </div>
        <div className="rnd-odds-note">
          rolls {range ? `${range.lo}–${range.hi}` : '—'}
        </div>
      </div>

      <button onClick={onRemove} title="Remove entry" aria-label="Remove entry"
        className="rnd-remove">✕</button>
    </div>
  );
}

function CreaturePicker({ statblocks, onPick, onClose }: {
  statblocks: MonsterStatblock[];
  onPick: (sb: MonsterStatblock) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', c);
    return () => document.removeEventListener('mousedown', c);
  }, [onClose]);
  const list = statblocks.filter(s => `${s.name} ${s.creature_type ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} className="rnd-picker">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search stat sheets…"
        className="rnd-picker-search" />
      <div className="rnd-picker-list">
        {list.map(s => (
          <button key={s.id} onClick={() => onPick(s)}
            className="rnd-picker-item"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span>{s.name}</span>
            {s.challenge_rating && <span className="rnd-cr">CR {s.challenge_rating}</span>}
          </button>
        ))}
        {list.length === 0 && <div className="rnd-picker-empty">No stat sheets to link.</div>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Encounter roll result
// ════════════════════════════════════════════════════════════

function RollResultView({
  kind, entry, result, roll, landed, die, params, onParamsChange, sbById, onViewStatblock, onBack, onReroll, onSave, onRun, saved,
}: {
  kind: string;
  entry: RandomEncounterEntry | null;
  result: CombatResult | SocialResult | null;
  roll: number;
  landed: string;
  die: number;
  params: RollParams;
  onParamsChange: (p: RollParams) => void;
  sbById: Map<string, MonsterStatblock>;
  onViewStatblock?: (sb: MonsterStatblock) => void;
  onBack: () => void;
  onReroll: () => void;
  onSave?: () => void;
  onRun?: () => void;
  saved: boolean;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const title = result?.title ?? entry?.name ?? '';
  const scene = result?.scene ?? entry?.description ?? '';
  const showAdjust = !!result; // only encounter rolls have adjustable params
  return (
    <div className="rnd-result">
      {/* Back + eyebrow */}
      <div className="rnd-result-head">
        <button onClick={onBack}
          className="rnd-back">‹ Table</button>
        <span className="rnd-result-kind">
          Rolled · {title || 'result'}
        </span>
      </div>

      {/* Die banner */}
      <div className="rnd-result-hero">
        <div className="rnd-result-die">
          <div className="rnd-result-roll">{roll}</div>
          <div className="rnd-result-face">d{die}</div>
        </div>
        <div>
          <div className="rnd-result-eyebrow">landed {landed}</div>
          <div className="rnd-result-title" style={{ color: title ? 'var(--ink)' : 'var(--ink-3)' }}>{title || (entry ? 'Unnamed result' : 'No entry covers this roll')}</div>
          {scene && <div className="rnd-result-scene">{scene}</div>}
        </div>
      </div>

      {result
        ? (result.mode === 'combat'
            ? <CombatBody result={result} params={params} sbById={sbById} onViewStatblock={onViewStatblock} />
            : <SocialBody result={result} />)
        : (entry && <NonEncounterResult kind={kind} entry={entry} />)}

      {/* Adjust panel — change roll parameters; the result re-scales live */}
      {showAdjust && adjustOpen && (
        <div className="rnd-adjust">
          <div className="rnd-layer-label is-spaced">Adjust & re-scale</div>
          <RollParamsControls params={params} onChange={onParamsChange} />
        </div>
      )}

      {/* Actions */}
      <div className="rnd-result-actions">
        {onRun && (
          <button onClick={onRun}
            className="rnd-btn-gold">
            ▶ Run in Initiative Tracker
          </button>
        )}
        {onSave && (
          <button onClick={onSave} disabled={saved}
            className="rnd-btn-line" style={{ color: saved ? 'var(--success)' : 'var(--ink-2)', border: `1px solid ${saved ? 'var(--success-line, var(--rule))' : 'var(--rule)'}`, cursor: saved ? 'default' : 'pointer' }}>
            {saved ? '✓ Saved to Encounters' : '＋ Save to Encounters'}
          </button>
        )}
        {showAdjust && (
          <button onClick={() => setAdjustOpen(o => !o)}
            className="rnd-btn-line is-clickable" style={{ color: adjustOpen ? 'var(--gold)' : 'var(--ink-2)', border: `1px solid ${adjustOpen ? 'var(--gold-line, var(--rule))' : 'var(--rule)'}` }}>
            ⚙ Adjust{adjustOpen ? ' ▴' : ' ▾'}
          </button>
        )}
        <button onClick={onReroll}
          className="rnd-btn-line is-clickable is-quiet">
          ⟳ Re-roll
        </button>
      </div>
    </div>
  );
}

function CombatBody({ result, params, sbById, onViewStatblock }: {
  result: CombatResult;
  params: RollParams;
  sbById: Map<string, MonsterStatblock>;
  onViewStatblock?: (sb: MonsterStatblock) => void;
}) {
  return (
    <>
      {/* Chips */}
      <div className="rnd-chips">
        <span className="rnd-chip" style={{ color: difficultyColor(result.tier), borderColor: difficultyColor(result.tier) }}>Lands at {result.tier}</span>
        <span className="rnd-chip">≈ {result.xp.toLocaleString()} adj. XP</span>
        <span className="rnd-chip">{result.total} {result.total === 1 ? 'creature' : 'creatures'}</span>
        <span className="rnd-chip">party {params.size} · lvl {params.level}</span>
      </div>

      {/* Roster */}
      <div className="rnd-layer">
        <div className="rnd-layer-label">Roster</div>
        {result.roster.length === 0 && (
          <p className="rnd-muted-note">
            No creatures — link some on the entry, or enable “Auto-generate” in the roll settings to have one improvised.
          </p>
        )}
        <div className="space-y-2">
          {result.roster.map((r, i) => {
            const sb = sbById.get(r.creature.id);
            return (
              <div key={i} className="rnd-roster-row">
                <span className="rnd-roster-count">{r.count}×</span>
                <span className="rnd-name">{r.creature.name}</span>
                {r.creature.cr && <span className="rnd-chip is-tight">CR {r.creature.cr}</span>}
                {r.isNew && <span className="rnd-new">✦ new</span>}
                <div className="rnd-grow" />
                {sb && onViewStatblock && (
                  <button onClick={() => onViewStatblock(sb)}
                    className="rnd-sheet-btn">Sheet</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Three layers */}
      <ResultLayer label="Battlefield" name={result.terrain.name} text={result.terrain.text} />
      <ResultLayer label="Complication" name={result.complication.name} text={result.complication.text} />
      <div className="rnd-sub-layer">
        <div className="rnd-layer-label">Loot</div>
        <div className="rnd-loot">
          <div><strong className="rnd-gold-text">Coin:</strong> {result.loot.coins}</div>
          <div><strong className="rnd-gold-text">On the bodies:</strong> {result.loot.find}</div>
          {result.loot.item && <div><strong className="rnd-gold-text">Magic:</strong> {result.loot.item}</div>}
        </div>
      </div>

      {result.tactics && (
        <div className="rnd-tactics-head">
          <div className="rnd-layer-label">DM Tactics</div>
          <p className="rnd-prose is-em">{result.tactics}</p>
        </div>
      )}
    </>
  );
}

function ResultLayer({ label, name, text }: { label: string; name: string; text: string }) {
  return (
    <div className="rnd-sub-layer">
      <div className="rnd-layer-label">{label}</div>
      <div className="rnd-panel">
        <div className="rnd-panel-name">{name}</div>
        <div className="rnd-panel-text">{text}</div>
      </div>
    </div>
  );
}

function SocialBody({ result }: { result: SocialResult }) {
  return (
    <>
      <div className="rnd-chips">
        <span className="rnd-chip is-goal">Goal · {result.goal}</span>
        <span className="rnd-chip">{result.successes} successes before {result.failures} failures</span>
      </div>

      <div className="rnd-layer">
        <div className="rnd-layer-label">Who they meet</div>
        <div className="space-y-2">
          {result.npcs.map((n, i) => (
            <div key={i} className="rnd-panel">
              <div className="rnd-name">{n.name}</div>
              <div className="rnd-npc-role">{n.role}</div>
              <div className="rnd-npc-text"><strong className="rnd-gold-text">Wants:</strong> {n.want}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rnd-layer">
        <div className="rnd-layer-label">Skill challenge</div>
        <div className="space-y-2">
          {result.checks.map((c, i) => (
            <div key={i} className="rnd-panel">
              <div className="rnd-challenge-head">
                <span className="rnd-challenge-name">{c.skill}</span>
                <span className="rnd-chip is-tight">DC {c.dc}</span>
              </div>
              <div className="rnd-pass">✓ {c.success}</div>
              <div className="rnd-fail">✗ {c.fail}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="rnd-layer-label">Running it</div>
        <p className="rnd-prose is-em">{result.tactics}</p>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// Non-encounter roll payloads (treasure / magic / wild / custom)
// ════════════════════════════════════════════════════════════

const RARITY_LABEL: Record<string, string> = Object.fromEntries(RARITIES.map(r => [r.key, r.label]));

function payloadCard(children: React.ReactNode, borderColor = 'var(--rule)'): React.ReactNode {
  return (
    <div className="rnd-payload" style={{ border: `1px solid ${borderColor}` }}>
      {children}
    </div>
  );
}

function NonEncounterResult({ kind, entry }: { kind: string; entry: RandomEncounterEntry }) {
  if (kind === 'treasure') {
    const nothing = !entry.coins && !entry.valuables && !entry.magicItem;
    return payloadCard(
      <>
        <div className="rnd-layer-label is-spaced">The haul</div>
        {nothing && <div className="rnd-muted-note">No hoard authored — add coin, valuables, or a magic item to this entry.</div>}
        {entry.coins && <HaulRow label="Coin" value={entry.coins} />}
        {entry.valuables && <HaulRow label="Valuables" value={entry.valuables} />}
        {entry.magicItem && <HaulRow label="Magic" value={entry.magicItem} />}
      </>,
      'var(--gold-line, var(--rule))',
    );
  }

  if (kind === 'magic') {
    return payloadCard(
      <>
        <div className="rnd-haul-chips">
          {entry.rarity && <span className="rnd-chip is-rarity">{RARITY_LABEL[entry.rarity] ?? entry.rarity}</span>}
          {entry.itemType && <span className="rnd-chip">{entry.itemType}</span>}
          <span className="rnd-chip">{entry.attunement ? 'Requires attunement' : 'No attunement'}</span>
        </div>
        {entry.itemText
          ? <div className="rnd-prose">{entry.itemText}</div>
          : <div className="rnd-muted-note">No item text yet.</div>}
      </>,
    );
  }

  if (kind === 'wild') {
    return payloadCard(
      <>
        <div className="rnd-surge-name">✦ {entry.name || 'Surge'}</div>
        <div className="rnd-prose" style={{ fontFamily: entry.effect ? 'var(--mono)' : undefined }}>
          {entry.effect || entry.description || <em className="rnd-dim">No surge effect authored.</em>}
        </div>
      </>,
      'var(--arcane-line)',
    );
  }

  if (kind === 'custom') {
    if (entry.cardKind) {
      const good = entry.cardKind === 'fortune';
      return payloadCard(
        <>
          <div className="rnd-haul-gap">
            <span className="rnd-chip" style={{ color: good ? 'var(--success)' : 'var(--red)', borderColor: good ? 'var(--success-line, var(--rule))' : 'var(--red-line, var(--rule))' }}>
              {good ? 'Fortune' : 'Doom'}
            </span>
          </div>
          <div className="rnd-prose">{entry.description || <em className="rnd-dim">No card text.</em>}</div>
        </>,
        good ? 'var(--success-line, var(--rule))' : 'var(--red-line, var(--rule))',
      );
    }
    // plain read-aloud (banner already shows name + description)
    return null;
  }

  return null;
}

function HaulRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rnd-haul-row">
      <span className="rnd-haul-label">{label}</span>
      <span className="rnd-haul-value">{value}</span>
    </div>
  );
}
