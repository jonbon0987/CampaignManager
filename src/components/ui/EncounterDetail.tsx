// Shared encounter editing panel — used by both campaign EncounterBuilder
// and the world-level WorldCombatView. Data is passed via props, not context.

import { useState, useEffect } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from './OverflowMenu';
import { SlashField } from './SlashField';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../../lib/database.types';

// ================================================================
// Constants
// ================================================================

export const ENVIRONMENTS = ['Dungeon', 'Forest', 'Urban', 'Cave', 'Open', 'Underground', 'Aquatic', 'Aerial', 'Other'];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'] as const;
export const STATUSES = ['draft', 'ready', 'completed'] as const;

export const VALID_CRS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
];

export const difficultyColors: Record<string, { bg: string; text: string; border: string }> = {
  easy:   { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success-line)' },
  medium: { bg: 'var(--warn-bg)',    text: 'var(--warn)',    border: 'var(--warn-line)' },
  hard:   { bg: 'var(--orange-bg)',  text: 'var(--orange)',  border: 'var(--orange-line)' },
  deadly: { bg: 'var(--red-bg)',     text: 'var(--red)',     border: 'var(--red-line)' },
};

export const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: 'var(--paper-2)',   text: 'var(--ink-3)',   border: 'var(--rule)' },
  ready:     { bg: 'var(--info-bg)',   text: 'var(--info)',    border: 'var(--info-line)' },
  completed: { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success-line)' },
};

export const sectionLabel: React.CSSProperties = {
  color: 'var(--gold)',
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: '0.5rem',
};

// ================================================================
// Types
// ================================================================

export type EncounterForm = {
  name: string;
  description: string;
  environment: string;
  difficulty: string;
  party_size: string;
  party_level: string;
  dm_notes: string;
  status: 'draft' | 'ready' | 'completed';
};

// Minimal data shape the save callback receives — callers inject campaign_id / world_id themselves
export type EncounterSaveData = {
  id?: string;
  name: string;
  description: string | null;
  environment: string | null;
  difficulty: string | null;
  party_size: number | null;
  party_level: number | null;
  dm_notes: string | null;
  status: 'draft' | 'ready' | 'completed';
  combatants: string | null;
  sort_order: number;
};

export function formFromEncounter(enc: Encounter): EncounterForm {
  return {
    name: enc.name,
    description: enc.description ?? '',
    environment: enc.environment ?? '',
    difficulty: enc.difficulty ?? '',
    party_size: enc.party_size != null ? String(enc.party_size) : '',
    party_level: enc.party_level != null ? String(enc.party_level) : '',
    dm_notes: enc.dm_notes ?? '',
    status: enc.status,
  };
}

export function parseCombatants(raw: string | null): EncounterCombatant[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as EncounterCombatant[]; }
  catch { return []; }
}

// ================================================================
// CombatantRow
// ================================================================

export function CombatantRow({
  c,
  statblockName,
  onCountChange,
  onNotesChange,
  onRemove,
  onViewSheet,
}: {
  c: EncounterCombatant;
  statblockName: string | null;
  onCountChange: (delta: number) => void;
  onNotesChange: (notes: string) => void;
  onRemove: () => void;
  onViewSheet?: () => void;
}) {
  return (
    <div
      className="rounded p-3 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--display)' }}>
            {c.name}
          </span>
          {c.challenge_rating && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060' }}>
              CR {c.challenge_rating}
            </span>
          )}
          {c.creature_type && (
            <span className="ml-1 text-xs capitalize" style={{ color: 'var(--ink-3)' }}>{c.creature_type}</span>
          )}
          {c.source === 'saved' && statblockName && onViewSheet && (
            <button
              onClick={onViewSheet}
              className="ml-1 text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
            >
              Sheet
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onCountChange(-1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
          >−</button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: 'var(--ink)' }}>{c.count}</span>
          <button
            onClick={() => onCountChange(1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
          >+</button>
        </div>
        <button
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ backgroundColor: 'var(--bg-2)', color: 'var(--red)', border: '1px solid var(--rule)' }}
        >✕</button>
      </div>
      <input
        type="text"
        value={c.notes ?? ''}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Notes for this combatant…"
        className="text-xs w-full px-2 py-1 rounded outline-none"
        style={{ backgroundColor: 'var(--paper)', color: 'var(--ink-2)', border: '1px solid var(--rule-soft)' }}
      />
    </div>
  );
}

// ================================================================
// EncounterDetail — inline autosave editing panel
// ================================================================

export function EncounterDetail({
  enc,
  monsterStatblocks,
  onDelete,
  onRun,
  onViewStatblock,
  upsertEncounter,
}: {
  enc: Encounter;
  monsterStatblocks: MonsterStatblock[];
  onDelete: () => void;
  onRun?: () => void;
  onViewStatblock: (sb: MonsterStatblock) => void;
  upsertEncounter: (data: EncounterSaveData) => Promise<Encounter>;
  enableMentions?: boolean;
}) {
  const [form, setForm] = useState<EncounterForm>(() => formFromEncounter(enc));
  const [combatants, setCombatants] = useState<EncounterCombatant[]>(() => parseCombatants(enc.combatants));

  const [addCreatureMode, setAddCreatureMode] = useState<'saved' | 'custom' | null>(null);
  const [customCreatureName, setCustomCreatureName] = useState('');
  const [customCreatureType, setCustomCreatureType] = useState('');
  const [customCreatureCR, setCustomCreatureCR] = useState('');

  useEffect(() => {
    setForm(formFromEncounter(enc));
    setCombatants(parseCombatants(enc.combatants));
    setAddCreatureMode(null);
  }, [enc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status: saveStatus, saveNow } = useAutoSave({
    data: { form, combatants },
    delay: 800,
    enabled: true,
    onSave: async ({ form: f, combatants: c }) => {
      await upsertEncounter({
        id: enc.id,
        name: f.name.trim() || 'Untitled',
        description: f.description || null,
        environment: f.environment || null,
        difficulty: f.difficulty || null,
        party_size: f.party_size ? parseInt(f.party_size, 10) : null,
        party_level: f.party_level ? parseInt(f.party_level, 10) : null,
        dm_notes: f.dm_notes || null,
        status: f.status,
        combatants: c.length > 0 ? JSON.stringify(c) : null,
        sort_order: enc.sort_order,
      });
    },
  });

  const addSavedCombatant = (statblockId: string) => {
    const sb = monsterStatblocks.find(m => m.id === statblockId);
    if (!sb) return;
    const existing = combatants.findIndex(c => c.statblock_id === statblockId);
    if (existing >= 0) {
      setCombatants(prev => prev.map((c, i) => i === existing ? { ...c, count: c.count + 1 } : c));
    } else {
      setCombatants(prev => [...prev, {
        id: crypto.randomUUID(),
        source: 'saved',
        statblock_id: statblockId,
        name: sb.name,
        creature_type: sb.creature_type,
        challenge_rating: sb.challenge_rating,
        count: 1,
        notes: null,
      }]);
    }
    setAddCreatureMode(null);
  };

  const addCustomCombatant = () => {
    if (!customCreatureName.trim()) return;
    setCombatants(prev => [...prev, {
      id: crypto.randomUUID(),
      source: 'custom',
      statblock_id: null,
      name: customCreatureName.trim(),
      creature_type: customCreatureType || null,
      challenge_rating: VALID_CRS.includes(customCreatureCR) ? customCreatureCR : null,
      count: 1,
      notes: null,
    }]);
    setCustomCreatureName('');
    setCustomCreatureType('');
    setCustomCreatureCR('');
    setAddCreatureMode(null);
  };

  const updateCombatantCount = (id: string, delta: number) =>
    setCombatants(prev => prev.map(c => c.id === id ? { ...c, count: Math.max(1, c.count + delta) } : c));

  const updateCombatantNotes = (id: string, notes: string) =>
    setCombatants(prev => prev.map(c => c.id === id ? { ...c, notes: notes || null } : c));

  const removeCombatant = (id: string) =>
    setCombatants(prev => prev.filter(c => c.id !== id));

  const totalCreatures = combatants.reduce((sum, c) => sum + c.count, 0);
  const canRun = !!onRun && enc.status !== 'completed' && combatants.length > 0;
  const diffVal = form.difficulty || enc.difficulty;

  return (
    <div style={{ maxWidth: '700px' }}>

      {/* ── Action bar ── */}
      <div className="as-bar" style={{ marginBottom: '20px' }}>
        <SaveStatusIndicator status={saveStatus} onRetry={saveNow} />
        <div className="as-spacer" />
        {canRun && (
          <button
            onClick={onRun}
            style={{
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--bg)',
              backgroundColor: 'var(--gold)', border: '1px solid var(--gold)',
              borderRadius: 'var(--radius)', padding: '6px 16px', cursor: 'pointer',
              fontFamily: 'var(--serif)',
            }}
          >
            ▶ Run Encounter
          </button>
        )}
        <OverflowMenu items={[
          { label: 'Delete encounter', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* ── Eyebrow ── */}
      <div style={{
        color: 'var(--ink-3)', fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '6px',
      }}>
        Encounter{diffVal ? ` · ${diffVal}` : ''}
      </div>

      {/* ── Title ── */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Encounter name…"
        style={{ marginBottom: '20px', display: 'block', width: '100%' }}
      />

      {/* ── Meta strip ── */}
      <div className="as-meta" style={{ marginBottom: '24px' }}>
        <div className="as-mi">
          <div className="as-ml">Status</div>
          <select className="as-select" value={form.status}
            onChange={e => setForm(prev => ({ ...prev, status: e.target.value as EncounterForm['status'] }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <div className="as-ml">Environment</div>
          <input className="as-input" list="env-list-ed" value={form.environment}
            onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))} placeholder="—" />
          <datalist id="env-list-ed">
            {ENVIRONMENTS.map(env => <option key={env} value={env} />)}
          </datalist>
        </div>
        <div className="as-mi">
          <div className="as-ml">Party Size</div>
          <input className="as-input" type="number" min={1} max={10} value={form.party_size}
            onChange={e => setForm(prev => ({ ...prev, party_size: e.target.value }))}
            placeholder="—" style={{ width: '56px' }} />
        </div>
        <div className="as-mi">
          <div className="as-ml">Avg Level</div>
          <input className="as-input" type="number" min={1} max={20} value={form.party_level}
            onChange={e => setForm(prev => ({ ...prev, party_level: e.target.value }))}
            placeholder="—" style={{ width: '56px' }} />
        </div>
      </div>

      {/* ── Difficulty pills ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">Difficulty</div>
        <div className="as-pills">
          {DIFFICULTIES.map(d => (
            <button key={d}
              className={`as-pill-opt${form.difficulty === d ? ' is-active' : ''}`}
              onClick={() => setForm(prev => ({ ...prev, difficulty: prev.difficulty === d ? '' : d }))}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Description ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">Description</div>
        <SlashField
          value={form.description ?? ''}
          onChange={v => setForm(prev => ({ ...prev, description: v }))}
          placeholder="Scene-setting description for the encounter…"
        />
      </div>

      {/* ── Combatants ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={sectionLabel}>Combatants</div>
        <div className="space-y-2 mb-3">
          {combatants.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>No combatants added yet.</p>
          )}
          {combatants.map(c => {
            const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
            return (
              <CombatantRow
                key={c.id}
                c={c}
                statblockName={sb?.name ?? null}
                onCountChange={delta => updateCombatantCount(c.id, delta)}
                onNotesChange={notes => updateCombatantNotes(c.id, notes)}
                onRemove={() => removeCombatant(c.id)}
                onViewSheet={sb ? () => onViewStatblock(sb) : undefined}
              />
            );
          })}
        </div>

        {addCreatureMode === null && (
          <div className="flex gap-2">
            {monsterStatblocks.length > 0 && (
              <button onClick={() => setAddCreatureMode('saved')} className="text-xs px-3 py-1.5 rounded"
                style={{ backgroundColor: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-line)' }}>
                + From Library
              </button>
            )}
            <button onClick={() => setAddCreatureMode('custom')} className="text-xs px-3 py-1.5 rounded"
              style={{ backgroundColor: 'var(--bg-2)', color: 'var(--ink-2)', border: '1px solid var(--rule)' }}>
              + Custom Creature
            </button>
          </div>
        )}

        {addCreatureMode === 'saved' && (
          <div className="rounded p-3 space-y-2" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--gold)' }}>Select from Library</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {monsterStatblocks.map(m => (
                <button key={m.id} onClick={() => addSavedCombatant(m.id)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2"
                  style={{ backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule-soft)' }}>
                  <span className="flex-1">{m.name}</span>
                  {m.challenge_rating && <span style={{ color: '#c08060' }}>CR {m.challenge_rating}</span>}
                  {m.creature_type && <span className="capitalize" style={{ color: 'var(--ink-3)' }}>{m.creature_type}</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setAddCreatureMode(null)} className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--ink-3)', border: '1px solid var(--rule)' }}>Cancel</button>
          </div>
        )}

        {addCreatureMode === 'custom' && (
          <div className="rounded p-3 space-y-2" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--gold)' }}>Add Custom Creature</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <input type="text" value={customCreatureName}
                  onChange={e => setCustomCreatureName(e.target.value)}
                  placeholder="Creature name *" className="as-input w-full" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCombatant(); } }} />
              </div>
              <input type="text" value={customCreatureType}
                onChange={e => setCustomCreatureType(e.target.value)}
                placeholder="Type (optional)" className="as-input" />
              <input type="text" value={customCreatureCR}
                onChange={e => setCustomCreatureCR(e.target.value)}
                placeholder="CR (optional)" className="as-input" />
            </div>
            <div className="flex gap-2">
              <button onClick={addCustomCombatant} className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#a07830', color: 'var(--ink)' }}>Add</button>
              <button onClick={() => setAddCreatureMode(null)} className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--ink-3)', border: '1px solid var(--rule)' }}>Cancel</button>
            </div>
          </div>
        )}

        {totalCreatures > 0 && (
          <div style={{ marginTop: '8px', color: 'var(--ink-3)', fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
            {totalCreatures} {totalCreatures === 1 ? 'creature' : 'creatures'} total
          </div>
        )}
      </div>

      {/* ── DM Notes ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">DM Notes</div>
        <SlashField
          value={form.dm_notes ?? ''}
          onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))}
          placeholder="Tactics, pacing tips, dramatic moments…"
        />
      </div>

      {/* ── Run CTA ── */}
      {canRun && (
        <button
          onClick={onRun}
          style={{
            width: '100%', backgroundColor: 'var(--gold)', color: 'var(--bg)',
            border: 'none', borderRadius: 'var(--radius)', padding: '12px',
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--serif)',
            cursor: 'pointer', letterSpacing: '0.02em',
          }}
        >
          ▶ Run Encounter · {totalCreatures} {totalCreatures === 1 ? 'creature' : 'creatures'}
        </button>
      )}
    </div>
  );
}
