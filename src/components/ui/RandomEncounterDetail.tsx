// Shared random-table builder + roller — used by the campaign RandomEncounters
// tab and the world-level WorldCombatView. A weighted table (any die d4–d100) of
// a given kind (encounter / treasure / magic / wild / custom); entry weights map
// to live roll odds. Encounter tables additionally link creatures, take party
// settings, and roll into a party-scaled combat (or social) result that can be
// saved to Encounters or run in the Initiative Tracker.

import { useState, useEffect, useMemo, useRef } from 'react';
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
import type { EncounterSaveData } from './EncounterDetail';
import type { RandomEncounterTable, RandomEncounterEntry, MonsterStatblock, EncounterCombatant } from '../../lib/database.types';

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

const diffColors: Record<string, string> = {
  easy: 'var(--diff-easy, var(--success))', medium: 'var(--gold)',
  hard: 'var(--diff-hard, var(--orange))', deadly: 'var(--diff-deadly, var(--red))',
};

// Party size / avg level / difficulty / social dial — shared by the builder's
// roll bar and the result view's "Adjust & re-roll" panel.
function RollParamsControls({ params, onChange }: { params: RollParams; onChange: (p: RollParams) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '16px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span className="as-ml">Party size</span>
        <input type="number" min={1} max={10} value={params.size}
          onChange={e => onChange({ ...params, size: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="as-input" style={{ width: '56px' }} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span className="as-ml">Avg level</span>
        <input type="number" min={1} max={20} value={params.level}
          onChange={e => onChange({ ...params, level: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="as-input" style={{ width: '56px' }} />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span className="as-ml">Difficulty</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DIFFICULTIES.map(d => {
            const on = params.difficulty === d;
            return (
              <button key={d} onClick={() => onChange({ ...params, difficulty: d })}
                style={{
                  fontSize: '0.68rem', fontWeight: 600, textTransform: 'capitalize', padding: '3px 8px',
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                  color: on ? 'var(--bg)' : 'var(--ink-3)',
                  backgroundColor: on ? diffColors[d] : 'transparent',
                  border: `1px solid ${on ? diffColors[d] : 'var(--rule)'}`,
                }}>{d}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '150px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="as-ml">⚔ Combat</span><span className="as-ml">Social ◇</span>
        </div>
        <input type="range" min={0} max={100} value={Math.round(params.socialBias * 100)}
          onChange={e => onChange({ ...params, socialBias: (parseInt(e.target.value, 10) || 0) / 100 })}
          style={{ accentColor: 'var(--gold)' }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          ≈ {Math.round(params.socialBias * 100)}% chance of a social encounter
        </span>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flexBasis: '100%', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={params.autoGenerate}
          onChange={e => onChange({ ...params, autoGenerate: e.target.checked })}
          style={{ accentColor: 'var(--gold)' }}
        />
        <span style={{ fontSize: '0.72rem', color: 'var(--ink-2)' }}>
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
    <div style={{ maxWidth: '820px' }}>
      {/* ── Action bar ── */}
      <div className="as-bar" style={{ marginBottom: '20px' }}>
        <SaveStatusIndicator status={saveStatus} onRetry={saveNow} />
        <div className="as-spacer" />
        <button
          onClick={roll}
          disabled={entries.length === 0}
          title={entries.length === 0 ? 'Add rows first' : `Roll d${form.die_size}`}
          style={{
            fontSize: '0.75rem', fontWeight: 600,
            color: entries.length === 0 ? 'var(--ink-4)' : 'var(--bg)',
            backgroundColor: entries.length === 0 ? 'var(--bg-2)' : 'var(--gold)',
            border: `1px solid ${entries.length === 0 ? 'var(--rule)' : 'var(--gold)'}`,
            borderRadius: 'var(--radius)', padding: '6px 16px',
            cursor: entries.length === 0 ? 'default' : 'pointer',
            fontFamily: 'var(--serif)',
          }}
        >
          ⚄ Roll d{form.die_size}
        </button>
        <OverflowMenu items={[
          { label: 'Delete table', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* ── Eyebrow ── */}
      <div style={{
        color: 'var(--ink-3)', fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '6px',
      }}>
        {meta.label} Table · {scope === 'world' ? 'World' : 'Campaign'}
      </div>

      {/* ── Title + subtitle ── */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Name this table…"
        maxLength={limitFor('random_encounter_tables', 'name')}
        style={{ display: 'block', width: '100%' }}
      />
      <input
        className="as-sub"
        value={form.subtitle}
        onChange={e => setForm(prev => ({ ...prev, subtitle: e.target.value }))}
        placeholder="A line of flavor — where and when this table applies…"
        maxLength={limitFor('random_encounter_tables', 'subtitle')}
        style={{ display: 'block', width: '100%', marginBottom: '18px' }}
      />

      {/* ── Meta strip ── */}
      <div className="as-meta" style={{ marginBottom: '20px' }}>
        <div className="as-mi">
          <div className="as-ml">Kind</div>
          <select className="as-select" value={form.kind}
            onChange={e => { setForm(prev => ({ ...prev, kind: e.target.value })); setRolled(null); setBuilt(null); }}>
            {RANDOM_TABLE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <div className="as-ml">Region</div>
          <input className="as-input" value={form.environment}
            onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))}
            placeholder="Anywhere" maxLength={limitFor('random_encounter_tables', 'environment')} style={{ width: '130px' }} />
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
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--gold)' }}>
            d{form.die_size} · weighted
          </span>
        </div>
      </div>

      {/* ── Roll settings (encounter kind) ── */}
      {isEncounter && (
        <div style={{
          marginBottom: '20px', padding: '12px 14px', borderRadius: 'var(--radius)',
          border: '1px solid var(--rule)', backgroundColor: 'var(--bg)',
        }}>
          <RollParamsControls params={rollParams} onChange={setRollParams} />
        </div>
      )}

      {/* ── Entries ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
          <div style={{ color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Entries
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ color: 'var(--ink-3)', fontSize: '0.62rem', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
            weights → roll odds
          </div>
        </div>

        {entries.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--ink-3)', marginBottom: '8px' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={addRow}
            className="text-xs px-3 py-1.5 rounded"
            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
          >
            + Add entry
          </button>
          <button
            onClick={suggestEntry}
            disabled={suggesting}
            title="Let the DM Assistant write one entry for this table"
            className="text-xs px-3 py-1.5 rounded"
            style={{
              backgroundColor: 'var(--arcane-bg)', color: 'var(--arcane)', border: '1px solid var(--arcane-line)',
              cursor: suggesting ? 'default' : 'pointer', opacity: suggesting ? 0.7 : 1,
            }}
          >
            {suggesting ? 'Suggesting…' : '✦ Suggest an entry'}
          </button>
          {suggestError && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>{suggestError}</span>}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">Notes for this table</div>
        <SlashField value={form.description} onChange={v => setForm(prev => ({ ...prev, description: v }))}
          placeholder="How and when this table applies, pacing, tie-ins…"
          maxLength={limitFor('random_encounter_tables', 'description')} />
      </div>
      <div className="as-fl" style={{ marginBottom: '24px' }}>
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

const TYPE_TAG_COLOR: Record<string, string> = {
  combat: 'var(--red)', social: 'var(--sky, var(--info))', either: 'var(--ink-3)',
};

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
      style={{
        display: 'grid', gridTemplateColumns: '24px 1fr 176px 26px', gap: '10px', alignItems: 'start',
        padding: '10px 12px', borderRadius: 'var(--radius)',
        backgroundColor: rolled ? 'var(--arcane-bg)' : 'var(--bg)',
        border: `1px solid ${rolled ? 'var(--arcane-line)' : 'var(--rule)'}`,
      }}
    >
      <div style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 700, paddingTop: '5px' }}>{idx}</div>

      <div style={{ minWidth: 0 }}>
        <input
          type="text" value={entry.name}
          onChange={e => onPatch({ name: e.target.value })}
          placeholder="Result name…"
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontFamily: 'var(--display)', fontSize: '1rem', fontWeight: 600 }}
          aria-label="Result name"
        />
        <textarea
          value={entry.description} rows={2}
          onChange={e => onPatch({ description: e.target.value })}
          placeholder="A brief description the DM reads or paraphrases…"
          style={{ width: '100%', marginTop: '4px', resize: 'vertical', backgroundColor: 'var(--paper)', color: 'var(--ink-2)', border: '1px solid var(--rule-soft)', borderRadius: 'var(--radius)', padding: '5px 8px', fontSize: '0.8rem', outline: 'none', lineHeight: 1.45 }}
          aria-label="Result description"
        />

        {/* Encounter meta: type tag + linked creatures */}
        {isEncounter && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
            <button
              onClick={cycleType}
              title="Click to cycle combat / social / either"
              style={{
                fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 7px', borderRadius: '999px', cursor: 'pointer',
                color: TYPE_TAG_COLOR[entryKind], backgroundColor: 'transparent',
                border: `1px solid ${TYPE_TAG_COLOR[entryKind]}`,
              }}
            >{entryKind}</button>

            {creatures.map(c => {
              const sb = sbById.get(c.id);
              if (!sb) return null;
              return (
                <span key={c.id}
                  onClick={() => onViewStatblock?.(sb)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem',
                    padding: '2px 7px', borderRadius: '999px', cursor: onViewStatblock ? 'pointer' : 'default',
                    color: 'var(--ink)', backgroundColor: 'var(--bg-2)', border: '1px solid var(--rule)',
                  }}
                >
                  {sb.name}
                  {sb.challenge_rating && <span style={{ color: 'var(--cr, var(--ink-4))', fontFamily: 'var(--mono)', fontSize: '0.6rem' }}>CR {sb.challenge_rating}</span>}
                  <span onClick={e => { e.stopPropagation(); unlink(c.id); }} style={{ color: 'var(--ink-4)', cursor: 'pointer' }}>✕</span>
                </span>
              );
            })}

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(o => !o)}
                style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', cursor: 'pointer', color: 'var(--ink-2)', backgroundColor: 'transparent', border: '1px dashed var(--rule-hover)' }}
              >+ link creature</button>
              {pickerOpen && (
                <CreaturePicker statblocks={statblocks} onPick={linkCreature} onClose={() => setPickerOpen(false)} />
              )}
            </div>

          </div>
        )}

        {/* Treasure fields */}
        {kind === 'treasure' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '8px' }}>
            <input type="text" value={entry.coins ?? ''} onChange={e => onPatch({ coins: e.target.value })}
              placeholder="Coin — e.g. 4d6 × 100 gp" className="as-input" style={{ fontSize: '0.72rem' }} aria-label="Coin" />
            <input type="text" value={entry.valuables ?? ''} onChange={e => onPatch({ valuables: e.target.value })}
              placeholder="Valuables" className="as-input" style={{ fontSize: '0.72rem' }} aria-label="Valuables" />
            <input type="text" value={entry.magicItem ?? ''} onChange={e => onPatch({ magicItem: e.target.value })}
              placeholder="Magic item" className="as-input" style={{ fontSize: '0.72rem' }} aria-label="Magic item" />
          </div>
        )}

        {/* Magic Item fields */}
        {kind === 'magic' && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="text" value={entry.itemType ?? ''} onChange={e => onPatch({ itemType: e.target.value })}
                placeholder="Item type — e.g. Wondrous item" className="as-input" style={{ fontSize: '0.72rem', flex: 1 }} aria-label="Item type" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={!!entry.attunement} onChange={e => onPatch({ attunement: e.target.checked })} />
                Attunement
              </label>
            </div>
            <textarea value={entry.itemText ?? ''} rows={2} onChange={e => onPatch({ itemText: e.target.value })}
              placeholder="Item text — what it does…"
              style={{ width: '100%', marginTop: '6px', resize: 'vertical', backgroundColor: 'var(--paper)', color: 'var(--ink-2)', border: '1px solid var(--rule-soft)', borderRadius: 'var(--radius)', padding: '5px 8px', fontSize: '0.78rem', outline: 'none', lineHeight: 1.45 }}
              aria-label="Item text" />
          </div>
        )}

        {/* Wild Magic field */}
        {kind === 'wild' && (
          <textarea value={entry.effect ?? ''} rows={2} onChange={e => onPatch({ effect: e.target.value })}
            placeholder="Surge effect…"
            style={{ width: '100%', marginTop: '8px', resize: 'vertical', backgroundColor: 'var(--paper)', color: 'var(--arcane)', border: '1px solid var(--rule-soft)', borderRadius: 'var(--radius)', padding: '5px 8px', fontSize: '0.78rem', fontFamily: 'var(--mono)', outline: 'none', lineHeight: 1.45 }}
            aria-label="Surge effect" />
        )}

        {/* Custom card kind */}
        {kind === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <span className="as-ml">Card</span>
            <select className="as-select" value={entry.cardKind ?? ''}
              onChange={e => onPatch({ cardKind: (e.target.value || undefined) as RandomEncounterEntry['cardKind'] })}
              style={{ fontSize: '0.72rem', padding: '2px 6px' }} aria-label="Card kind">
              <option value="">Read-aloud (no card)</option>
              <option value="fortune">Fortune (good)</option>
              <option value="doom">Doom (bad)</option>
            </select>
          </div>
        )}
      </div>

      {/* Weight control + live odds */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {rarityMode ? (
            <select className="as-select" value={entry.rarity ?? 'common'} onChange={e => onSetRarity(e.target.value)}
              style={{ fontSize: '0.72rem', padding: '2px 6px' }} aria-label="Rarity">
              {RARITIES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--ink-3)' }}>weight</span>
              <input type="number" min={1} value={entry.weight}
                onChange={e => onPatch({ weight: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="as-input" style={{ width: '48px', textAlign: 'center', padding: '2px 4px' }} aria-label="Weight" />
            </div>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>
            {range ? Math.round(range.pct * 100) : 0}%
          </span>
        </div>
        <div style={{ height: '4px', backgroundColor: 'var(--rule)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${range ? range.pct * 100 : 0}%`, backgroundColor: 'var(--gold)' }} />
        </div>
        <div style={{ marginTop: '4px', fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--ink-3)' }}>
          rolls {range ? `${range.lo}–${range.hi}` : '—'}
        </div>
      </div>

      <button onClick={onRemove} title="Remove entry" aria-label="Remove entry"
        style={{ background: 'var(--bg-2)', color: 'var(--red)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', width: '26px', height: '26px', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
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
    <div ref={ref} style={{ position: 'absolute', left: 0, top: '115%', zIndex: 30, width: '230px', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', boxShadow: '0 12px 30px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search stat sheets…"
        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: 'none', borderBottom: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none', fontSize: '0.78rem' }} />
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {list.map(s => (
          <button key={s.id} onClick={() => onPick(s)}
            style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--rule-soft)', cursor: 'pointer', color: 'var(--ink)', fontSize: '0.78rem', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span>{s.name}</span>
            {s.challenge_rating && <span style={{ color: 'var(--cr, var(--ink-4))', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>CR {s.challenge_rating}</span>}
          </button>
        ))}
        {list.length === 0 && <div style={{ padding: '12px', color: 'var(--ink-3)', fontSize: '0.72rem' }}>No stat sheets to link.</div>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Encounter roll result
// ════════════════════════════════════════════════════════════

const chipStyle: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
  padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--chip-bg, var(--bg-2))',
  color: 'var(--ink-2)', border: '1px solid var(--chip-line, var(--rule))',
};
const layerLabel: React.CSSProperties = {
  color: 'var(--gold)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px',
};

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
    <div style={{ maxWidth: '760px' }}>
      {/* Back + eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button onClick={onBack}
          style={{ fontSize: '0.72rem', color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer' }}>‹ Table</button>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          Rolled · {title || 'result'}
        </span>
      </div>

      {/* Die banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '16px 20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--arcane-line)', backgroundColor: 'var(--arcane-bg)', marginBottom: '18px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--arcane)', fontFamily: 'var(--display)', lineHeight: 1 }}>{roll}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--ink-3)' }}>d{die}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>landed {landed}</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: title ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--display)' }}>{title || (entry ? 'Unnamed result' : 'No entry covers this roll')}</div>
          {scene && <div style={{ color: 'var(--ink-2)', fontSize: '0.85rem', fontStyle: 'italic', marginTop: '2px' }}>{scene}</div>}
        </div>
      </div>

      {result
        ? (result.mode === 'combat'
            ? <CombatBody result={result} params={params} sbById={sbById} onViewStatblock={onViewStatblock} />
            : <SocialBody result={result} />)
        : (entry && <NonEncounterResult kind={kind} entry={entry} />)}

      {/* Adjust panel — change roll parameters; the result re-scales live */}
      {showAdjust && adjustOpen && (
        <div style={{ marginTop: '18px', padding: '12px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', backgroundColor: 'var(--bg)' }}>
          <div style={{ ...layerLabel, marginBottom: '10px' }}>Adjust & re-scale</div>
          <RollParamsControls params={params} onChange={onParamsChange} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--rule)' }}>
        {onRun && (
          <button onClick={onRun}
            style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--bg)', backgroundColor: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--serif)' }}>
            ▶ Run in Initiative Tracker
          </button>
        )}
        {onSave && (
          <button onClick={onSave} disabled={saved}
            style={{ fontSize: '0.78rem', fontWeight: 600, color: saved ? 'var(--success)' : 'var(--ink-2)', backgroundColor: 'transparent', border: `1px solid ${saved ? 'var(--success-line, var(--rule))' : 'var(--rule)'}`, borderRadius: 'var(--radius)', padding: '8px 14px', cursor: saved ? 'default' : 'pointer' }}>
            {saved ? '✓ Saved to Encounters' : '＋ Save to Encounters'}
          </button>
        )}
        {showAdjust && (
          <button onClick={() => setAdjustOpen(o => !o)}
            style={{ fontSize: '0.78rem', fontWeight: 600, color: adjustOpen ? 'var(--gold)' : 'var(--ink-2)', backgroundColor: 'transparent', border: `1px solid ${adjustOpen ? 'var(--gold-line, var(--rule))' : 'var(--rule)'}`, borderRadius: 'var(--radius)', padding: '8px 14px', cursor: 'pointer' }}>
            ⚙ Adjust{adjustOpen ? ' ▴' : ' ▾'}
          </button>
        )}
        <button onClick={onReroll}
          style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-2)', backgroundColor: 'transparent', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '8px 14px', cursor: 'pointer' }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
        <span style={{ ...chipStyle, color: diffColors[result.tier], borderColor: diffColors[result.tier] }}>Lands at {result.tier}</span>
        <span style={chipStyle}>≈ {result.xp.toLocaleString()} adj. XP</span>
        <span style={chipStyle}>{result.total} {result.total === 1 ? 'creature' : 'creatures'}</span>
        <span style={chipStyle}>party {params.size} · lvl {params.level}</span>
      </div>

      {/* Roster */}
      <div style={{ marginBottom: '18px' }}>
        <div style={layerLabel}>Roster</div>
        {result.roster.length === 0 && (
          <p style={{ color: 'var(--ink-3)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            No creatures — link some on the entry, or enable “Auto-generate” in the roll settings to have one improvised.
          </p>
        )}
        <div className="space-y-2">
          {result.roster.map((r, i) => {
            const sb = sbById.get(r.creature.id);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700, fontSize: '0.85rem' }}>{r.count}×</span>
                <span style={{ color: 'var(--ink)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: '0.92rem' }}>{r.creature.name}</span>
                {r.creature.cr && <span style={{ ...chipStyle, padding: '1px 7px' }}>CR {r.creature.cr}</span>}
                {r.isNew && <span style={{ fontSize: '0.6rem', color: 'var(--arcane)', fontWeight: 700 }}>✦ new</span>}
                <div style={{ flex: 1 }} />
                {sb && onViewStatblock && (
                  <button onClick={() => onViewStatblock(sb)}
                    style={{ fontSize: '0.65rem', color: 'var(--info, var(--sky))', background: 'var(--info-bg, var(--bg-2))', border: '1px solid var(--info-line, var(--rule))', borderRadius: 'var(--radius)', padding: '2px 8px', cursor: 'pointer' }}>Sheet</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Three layers */}
      <ResultLayer label="Battlefield" name={result.terrain.name} text={result.terrain.text} />
      <ResultLayer label="Complication" name={result.complication.name} text={result.complication.text} />
      <div style={{ marginBottom: '16px' }}>
        <div style={layerLabel}>Loot</div>
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)', color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          <div><strong style={{ color: 'var(--gold)' }}>Coin:</strong> {result.loot.coins}</div>
          <div><strong style={{ color: 'var(--gold)' }}>On the bodies:</strong> {result.loot.find}</div>
          {result.loot.item && <div><strong style={{ color: 'var(--gold)' }}>Magic:</strong> {result.loot.item}</div>}
        </div>
      </div>

      {result.tactics && (
        <div style={{ marginBottom: '4px' }}>
          <div style={layerLabel}>DM Tactics</div>
          <p style={{ color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.55, fontStyle: 'italic' }}>{result.tactics}</p>
        </div>
      )}
    </>
  );
}

function ResultLayer({ label, name, text }: { label: string; name: string; text: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={layerLabel}>{label}</div>
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
        <div style={{ color: 'var(--ink)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '3px' }}>{name}</div>
        <div style={{ color: 'var(--ink-2)', fontSize: '0.83rem', lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

function SocialBody({ result }: { result: SocialResult }) {
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
        <span style={{ ...chipStyle, color: 'var(--sky, var(--info))', borderColor: 'var(--sky, var(--info))' }}>Goal · {result.goal}</span>
        <span style={chipStyle}>{result.successes} successes before {result.failures} failures</span>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <div style={layerLabel}>Who they meet</div>
        <div className="space-y-2">
          {result.npcs.map((n, i) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
              <div style={{ color: 'var(--ink)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: '0.92rem' }}>{n.name}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: '0.72rem', marginBottom: '4px' }}>{n.role}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: '0.83rem' }}><strong style={{ color: 'var(--gold)' }}>Wants:</strong> {n.want}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <div style={layerLabel}>Skill challenge</div>
        <div className="space-y-2">
          {result.checks.map((c, i) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 'var(--radius)', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--ink)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: '0.88rem' }}>{c.skill}</span>
                <span style={{ ...chipStyle, padding: '1px 7px' }}>DC {c.dc}</span>
              </div>
              <div style={{ color: 'var(--success)', fontSize: '0.8rem', lineHeight: 1.45 }}>✓ {c.success}</div>
              <div style={{ color: 'var(--red)', fontSize: '0.8rem', lineHeight: 1.45 }}>✗ {c.fail}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={layerLabel}>Running it</div>
        <p style={{ color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.55, fontStyle: 'italic' }}>{result.tactics}</p>
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
    <div style={{ padding: '14px 18px', borderRadius: 'var(--radius-lg, 10px)', border: `1px solid ${borderColor}`, backgroundColor: 'var(--bg)' }}>
      {children}
    </div>
  );
}

function NonEncounterResult({ kind, entry }: { kind: string; entry: RandomEncounterEntry }) {
  if (kind === 'treasure') {
    const nothing = !entry.coins && !entry.valuables && !entry.magicItem;
    return payloadCard(
      <>
        <div style={{ ...layerLabel, marginBottom: '10px' }}>The haul</div>
        {nothing && <div style={{ color: 'var(--ink-3)', fontSize: '0.82rem', fontStyle: 'italic' }}>No hoard authored — add coin, valuables, or a magic item to this entry.</div>}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {entry.rarity && <span style={{ ...chipStyle, color: 'var(--gold)', borderColor: 'var(--gold-line, var(--rule))', backgroundColor: 'var(--gold-dim, var(--bg-2))' }}>{RARITY_LABEL[entry.rarity] ?? entry.rarity}</span>}
          {entry.itemType && <span style={chipStyle}>{entry.itemType}</span>}
          <span style={chipStyle}>{entry.attunement ? 'Requires attunement' : 'No attunement'}</span>
        </div>
        {entry.itemText
          ? <div style={{ color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.55 }}>{entry.itemText}</div>
          : <div style={{ color: 'var(--ink-3)', fontSize: '0.82rem', fontStyle: 'italic' }}>No item text yet.</div>}
      </>,
    );
  }

  if (kind === 'wild') {
    return payloadCard(
      <>
        <div style={{ color: 'var(--arcane)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: '1rem', marginBottom: '6px' }}>✦ {entry.name || 'Surge'}</div>
        <div style={{ color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.55, fontFamily: entry.effect ? 'var(--mono)' : undefined }}>
          {entry.effect || entry.description || <em style={{ color: 'var(--ink-3)' }}>No surge effect authored.</em>}
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
          <div style={{ marginBottom: '8px' }}>
            <span style={{ ...chipStyle, color: good ? 'var(--success)' : 'var(--red)', borderColor: good ? 'var(--success-line, var(--rule))' : 'var(--red-line, var(--rule))' }}>
              {good ? 'Fortune' : 'Doom'}
            </span>
          </div>
          <div style={{ color: 'var(--ink-2)', fontSize: '0.85rem', lineHeight: 1.55 }}>{entry.description || <em style={{ color: 'var(--ink-3)' }}>No card text.</em>}</div>
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
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '12px', padding: '6px 0', borderTop: '1px solid var(--rule-soft, var(--rule))' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold)', paddingTop: '2px' }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontSize: '0.9rem' }}>{value}</span>
    </div>
  );
}
