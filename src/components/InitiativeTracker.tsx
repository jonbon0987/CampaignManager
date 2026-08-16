import { useState, useCallback, useMemo, useRef } from 'react';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../lib/database.types';

// ─── D&D 5e conditions ───────────────────────────────────────────────────────
const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
] as const;
// Death-state conditions ('dying' | 'stable' | 'dead') are managed
// programmatically by the HP zone (not shown in the condition picker), but are
// still rendered as pills and are undoable.
type Condition = (typeof CONDITIONS)[number] | 'dying' | 'stable' | 'dead';

const conditionColors: Record<string, string> = {
  blinded: 'var(--ink-3)', charmed: 'var(--arcane)', deafened: 'var(--ink-3)',
  frightened: 'var(--gold)', grappled: 'var(--cr)', incapacitated: 'var(--ink-3)',
  invisible: 'var(--info)', paralyzed: 'var(--red)', petrified: 'var(--ink-3)',
  poisoned: 'var(--success)', prone: 'var(--accent)', restrained: 'var(--cr)',
  stunned: 'var(--diff-hard)', unconscious: 'var(--red)', concentrating: 'var(--info)',
  dying: 'var(--red)', stable: 'var(--moss)', dead: 'var(--ink-3)',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface DeathSaves {
  s: number; // successes (0–3)
  f: number; // failures (0–3)
}

interface Combatant {
  id: string;
  name: string;
  initiative: number | null;
  dexMod: number;
  maxHp: number;
  currentHp: number;
  temp: number;
  deathSaves: DeathSaves;
  ac: number | null;
  conditions: Set<Condition>;
  isPC: boolean;
  statblock: MonsterStatblock | null;
  notes: string | null;
}

// Snapshot pushed onto the undo stack before any HP-mutating action.
interface HpSnapshot {
  id: string;
  currentHp: number;
  maxHp: number;
  temp: number;
  conditions: Condition[];
  deathSaves: DeathSaves;
}

interface InitiativeTrackerProps {
  encounter: Encounter;
  statblocks: MonsterStatblock[];
  pcNames?: string[];
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function abilityMod(score: number | null): number {
  if (score == null) return 0;
  return Math.floor((score - 10) / 2);
}

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function parseCombatants(raw: string | null): EncounterCombatant[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as EncounterCombatant[]; }
  catch { return []; }
}

// Kind glyph mapping
function kindGlyph(isPC: boolean): string {
  return isPC ? '◈' : '◆';
}

// HP bar color based on percentage
function hpBarColor(pct: number): string {
  if (pct > 60) return 'linear-gradient(to right, var(--accent), var(--gold))';
  if (pct > 25) return 'linear-gradient(to right, var(--accent), var(--diff-hard))';
  return 'linear-gradient(to right, var(--red), var(--accent))';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Big-number readout color: red when down, orange when bloodied, ink when healthy.
// A combatant with no max (unconfigured PC HP) reads as neutral, never "down".
function hpColor(hp: number, max: number): string {
  if (max <= 0) return 'var(--ink-2)';
  if (hp <= 0) return 'var(--red)';
  return hp <= max / 2 ? 'var(--orange)' : 'var(--ink)';
}

const DEATH_STATE = ['unconscious', 'dying', 'stable', 'dead'] as const;

// ─── Component ───────────────────────────────────────────────────────────────
export function InitiativeTracker({ encounter, statblocks, pcNames = [], onClose }: InitiativeTrackerProps) {
  const initialCombatants = useMemo(() => {
    const result: Combatant[] = [];
    const encounterCombatants = parseCombatants(encounter.combatants);

    for (const ec of encounterCombatants) {
      const sb = ec.statblock_id ? statblocks.find(m => m.id === ec.statblock_id) : null;
      const dexMod = sb ? abilityMod(sb.dex) : 0;
      const maxHp = sb?.hit_points ?? 10;
      const ac = sb?.armor_class ?? null;

      for (let i = 0; i < ec.count; i++) {
        const label = ec.count > 1 ? ` ${String.fromCharCode(65 + i)}` : '';
        result.push({
          id: crypto.randomUUID(),
          name: `${ec.name}${label}`,
          initiative: null,
          dexMod,
          maxHp,
          currentHp: maxHp,
          temp: 0,
          deathSaves: { s: 0, f: 0 },
          ac,
          conditions: new Set(),
          isPC: false,
          statblock: sb ?? null,
          notes: ec.notes,
        });
      }
    }

    for (const name of pcNames) {
      result.push({
        id: crypto.randomUUID(),
        name,
        initiative: null,
        dexMod: 0,
        maxHp: 0,
        currentHp: 0,
        temp: 0,
        deathSaves: { s: 0, f: 0 },
        ac: null,
        conditions: new Set(),
        isPC: true,
        statblock: null,
        notes: null,
      });
    }

    return result;
  }, [encounter.combatants, statblocks, pcNames]);

  const [combatants, setCombatants] = useState<Combatant[]>(initialCombatants);
  const [currentTurn, setCurrentTurn] = useState<number>(-1);
  const [round, setRound] = useState(1);
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);
  const [conditionMenuId, setConditionMenuId] = useState<string | null>(null);
  const [addingCombatant, setAddingCombatant] = useState(false);

  // Undo stack for HP-mutating actions. Kept in a ref (source of truth); its
  // length is mirrored into state so the header Undo button re-renders.
  const historyRef = useRef<HpSnapshot[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const [newCombatantName, setNewCombatantName] = useState('');

  const started = currentTurn >= 0;

  const sorted = useMemo(() => {
    return [...combatants].sort((a, b) => {
      const ai = a.initiative ?? -999;
      const bi = b.initiative ?? -999;
      if (bi !== ai) return bi - ai;
      return b.dexMod - a.dexMod;
    });
  }, [combatants]);

  const rollAllInitiatives = useCallback(() => {
    setCombatants(prev => prev.map(c => ({
      ...c,
      initiative: rollD20() + c.dexMod,
    })));
  }, []);

  const rollNPCInitiatives = useCallback(() => {
    setCombatants(prev => prev.map(c => ({
      ...c,
      initiative: c.isPC ? c.initiative : rollD20() + c.dexMod,
    })));
  }, []);

  const setInitiative = useCallback((id: string, value: number | null) => {
    setCombatants(prev => prev.map(c => c.id === id ? { ...c, initiative: value } : c));
  }, []);

  const startCombat = () => {
    setCurrentTurn(0);
    setRound(1);
  };

  const nextTurn = () => {
    const nextIdx = currentTurn + 1;
    if (nextIdx >= sorted.length) {
      setCurrentTurn(0);
      setRound(r => r + 1);
    } else {
      setCurrentTurn(nextIdx);
    }
  };

  const resetCombat = () => {
    setCurrentTurn(-1);
    setRound(1);
  };

  // Push the current state of a combatant onto the undo stack, then apply a
  // producer. All temp-first / revive / death-state rules live in the producers
  // below so they stay consistent across typed values, nudges, and death saves.
  const mutate = (id: string, producer: (c: Combatant) => Combatant) => {
    const c = combatants.find(x => x.id === id);
    if (c) {
      historyRef.current.push({
        id,
        currentHp: c.currentHp,
        maxHp: c.maxHp,
        temp: c.temp,
        conditions: [...c.conditions],
        deathSaves: { ...c.deathSaves },
      });
      setHistoryLen(historyRef.current.length);
    }
    setCombatants(prev => prev.map(x => x.id === id ? producer(x) : x));
  };

  // clamp to [0, maxHp] when a max is configured, else just floor at 0 (PCs
  // whose max HP is unknown are tracked as a running current-HP counter).
  const clampHp = (hp: number, maxHp: number) =>
    maxHp > 0 ? clamp(hp, 0, maxHp) : Math.max(0, hp);

  const damage = (id: string, n: number) => {
    if (!(n > 0)) return;
    mutate(id, c => {
      let dmg = n;
      let temp = c.temp;
      if (temp > 0) { const absorbed = Math.min(temp, dmg); temp -= absorbed; dmg -= absorbed; }
      const newHp = clampHp(c.currentHp - dmg, c.maxHp);
      const conditions = new Set(c.conditions);
      DEATH_STATE.forEach(s => conditions.delete(s));
      let deathSaves = c.deathSaves;
      // Only a combatant with a known max can be "down" — this keeps freshly
      // added PCs (0/0, HP not yet entered) from triggering death saves.
      if (newHp === 0 && c.maxHp > 0) {
        if (c.isPC) { conditions.add('dying'); deathSaves = { s: 0, f: 0 }; }
        else conditions.add('unconscious');
      } else if (newHp === 0 && !c.isPC) {
        conditions.add('unconscious'); // preserve monster auto-unconscious
      }
      return { ...c, currentHp: newHp, temp, conditions, deathSaves };
    });
  };

  const heal = (id: string, n: number) => {
    if (!(n > 0)) return;
    mutate(id, c => {
      const conditions = new Set(c.conditions);
      DEATH_STATE.forEach(s => conditions.delete(s));
      // From 0 or below, healing revives to exactly n; otherwise it adds on.
      const raw = c.currentHp <= 0 ? n : c.currentHp + n;
      return { ...c, currentHp: clampHp(raw, c.maxHp), conditions, deathSaves: { s: 0, f: 0 } };
    });
  };

  // Temp HP does not stack (5e): a new source keeps the higher value.
  const addTemp = (id: string, n: number) => {
    if (!(n > 0)) return;
    mutate(id, c => ({ ...c, temp: Math.max(c.temp, n) }));
  };

  // Manually set current HP to an exact value (clamped to [0, max]). Mirrors the
  // damage/heal death-state rules so a direct edit down to 0 (or back up) leaves
  // conditions consistent.
  const setCurrentHp = (id: string, value: number) => {
    if (!(value >= 0)) return;
    mutate(id, c => {
      const newHp = clampHp(value, c.maxHp);
      const conditions = new Set(c.conditions);
      DEATH_STATE.forEach(s => conditions.delete(s));
      let deathSaves = c.deathSaves;
      if (newHp <= 0 && c.maxHp > 0) {
        if (c.isPC) { conditions.add('dying'); deathSaves = { s: 0, f: 0 }; }
        else conditions.add('unconscious');
      } else {
        deathSaves = { s: 0, f: 0 };
      }
      return { ...c, currentHp: newHp, conditions, deathSaves };
    });
  };

  // Override a combatant's max HP for this combat (e.g. a buffed boss, or a PC
  // whose HP wasn't configured). Current HP is re-clamped to the new max;
  // configuring a max for the first time defaults current to full.
  const setMaxHp = (id: string, value: number) => {
    if (!(value >= 0)) return;
    mutate(id, c => {
      const newMax = Math.max(0, Math.floor(value));
      let newHp = c.currentHp;
      if (newMax > 0 && c.maxHp === 0 && c.currentHp === 0) newHp = newMax; // first-time config → full
      else if (newMax > 0) newHp = Math.min(c.currentHp, newMax);
      return { ...c, maxHp: newMax, currentHp: newHp };
    });
  };

  const setDeathSave = (id: string, key: 's' | 'f', val: number) => {
    mutate(id, c => {
      const deathSaves: DeathSaves = { ...c.deathSaves, [key]: val };
      const conditions = new Set(c.conditions);
      (['dying', 'stable', 'dead'] as const).forEach(s => conditions.delete(s));
      if (deathSaves.f >= 3) conditions.add('dead');
      else if (deathSaves.s >= 3) { conditions.add('stable'); deathSaves.s = 3; deathSaves.f = 0; }
      else conditions.add('dying');
      return { ...c, deathSaves, conditions };
    });
  };

  const undo = () => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    setHistoryLen(historyRef.current.length);
    setCombatants(prev => prev.map(c => c.id === snap.id
      ? { ...c, currentHp: snap.currentHp, maxHp: snap.maxHp, temp: snap.temp, conditions: new Set(snap.conditions), deathSaves: snap.deathSaves }
      : c));
  };

  const toggleCondition = (id: string, condition: Condition) => {
    setCombatants(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = new Set(c.conditions);
      if (next.has(condition)) next.delete(condition);
      else next.add(condition);
      return { ...c, conditions: next };
    }));
  };

  const removeCombatant = (id: string) => {
    setCombatants(prev => prev.filter(c => c.id !== id));
    if (started) {
      const idx = sorted.findIndex(c => c.id === id);
      if (idx >= 0 && idx < currentTurn) {
        setCurrentTurn(t => t - 1);
      } else if (idx === currentTurn && currentTurn >= sorted.length - 1) {
        setCurrentTurn(0);
        setRound(r => r + 1);
      }
    }
  };

  const addNewCombatant = () => {
    if (!newCombatantName.trim()) return;
    setCombatants(prev => [...prev, {
      id: crypto.randomUUID(),
      name: newCombatantName.trim(),
      initiative: started ? rollD20() : null,
      dexMod: 0,
      maxHp: 10,
      currentHp: 10,
      temp: 0,
      deathSaves: { s: 0, f: 0 },
      ac: null,
      conditions: new Set(),
      isPC: false,
      statblock: null,
      notes: null,
    }]);
    setNewCombatantName('');
    setAddingCombatant(false);
  };

  const allHaveInitiative = combatants.every(c => c.initiative !== null);
  const currentCombatant = started ? sorted[currentTurn] ?? null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '24px',
        padding: '28px 32px 20px',
        borderBottom: '1px solid var(--rule)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            color: 'var(--ink-3)',
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily: 'var(--mono)',
            marginBottom: '4px',
          }}>
            Theater-of-the-Mind
          </div>
          <h2 style={{
            color: 'var(--ink)',
            fontSize: '1.5rem',
            fontWeight: 700,
            fontFamily: 'var(--display)',
            margin: 0,
            lineHeight: 1.2,
          }}>
            {started
              ? `Round ${round} · turn ${currentTurn + 1}/${sorted.length}`
              : encounter.name}
          </h2>
          {started && currentCombatant && (
            <div style={{ color: 'var(--ink-3)', fontSize: '0.78rem', marginTop: '4px', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
              {currentCombatant.name}'s turn
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={undo}
            disabled={historyLen === 0}
            title="Undo last HP change"
            style={{ ...ghostBtn, opacity: historyLen > 0 ? 1 : 0.4, cursor: historyLen > 0 ? 'pointer' : 'default' }}
          >
            ↺ Undo{historyLen > 0 ? ` (${historyLen})` : ''}
          </button>
          {!started ? (
            <>
              <button onClick={rollNPCInitiatives} style={ghostBtn}>Roll NPCs</button>
              <button onClick={rollAllInitiatives} style={ghostBtn}>Roll All</button>
              <button
                onClick={startCombat}
                disabled={!allHaveInitiative}
                style={{ ...primaryBtn, opacity: allHaveInitiative ? 1 : 0.4 }}
              >
                Start Combat
              </button>
            </>
          ) : (
            <>
              <button onClick={resetCombat} style={ghostBtn}>Reset</button>
              <button onClick={nextTurn} style={primaryBtn}>Next turn ▶</button>
            </>
          )}
          <button onClick={onClose} style={exitBtn}>✕ End</button>
        </div>
      </div>

      {/* Scoped styles for the HP zone (hover / focus / placeholder states that
          inline styles can't express). Prefixed `itk-` to avoid collisions. */}
      <style>{HP_ZONE_CSS}</style>

      {/* ── Combatant list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((c, idx) => (
          <CombatantRow
            key={c.id}
            c={c}
            isCurrent={started && idx === currentTurn}
            started={started}
            conditionMenuOpen={conditionMenuId === c.id}
            onSetInitiative={setInitiative}
            onViewStatblock={setViewingStatblock}
            onToggleCondition={toggleCondition}
            onToggleConditionMenu={() => setConditionMenuId(conditionMenuId === c.id ? null : c.id)}
            onRemove={removeCombatant}
            onDamage={damage}
            onHeal={heal}
            onTemp={addTemp}
            onSetHp={setCurrentHp}
            onSetMax={setMaxHp}
            onDeathSave={setDeathSave}
          />
        ))}

        {/* ── Add combatant ── */}
        <div style={{ padding: '12px 14px' }}>
          {addingCombatant ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={newCombatantName}
                onChange={e => setNewCombatantName(e.target.value)}
                placeholder="Combatant name…"
                autoFocus
                style={{
                  flex: 1,
                  fontSize: '0.85rem',
                  color: 'var(--ink)',
                  backgroundColor: 'var(--bg-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  outline: 'none',
                  fontFamily: 'var(--serif)',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') addNewCombatant();
                  if (e.key === 'Escape') setAddingCombatant(false);
                }}
              />
              <button onClick={addNewCombatant} style={primaryBtn}>Add</button>
              <button onClick={() => setAddingCombatant(false)} style={ghostBtn}>Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCombatant(true)}
              style={{
                color: 'var(--ink-4)',
                fontSize: '0.72rem',
                fontFamily: 'var(--mono)',
                backgroundColor: 'transparent',
                border: '1px dashed var(--rule-soft)',
                borderRadius: 'var(--radius)',
                padding: '6px 16px',
                cursor: 'pointer',
                width: '100%',
                letterSpacing: '0.08em',
              }}
            >
              + Add Combatant
            </button>
          )}
        </div>
      </div>

      {/* ── Stat block viewer ── */}
      {viewingStatblock && (
        <div style={{
          flexShrink: 0,
          overflowY: 'auto',
          padding: '16px 32px',
          borderTop: '1px solid var(--rule)',
          backgroundColor: 'var(--paper)',
          maxHeight: '38vh',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ color: 'var(--ink-3)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--mono)', marginBottom: '2px' }}>
                Stat Sheet
              </div>
              <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--display)', margin: 0 }}>
                {viewingStatblock.name}
              </h3>
            </div>
            <button onClick={() => setViewingStatblock(null)}
              style={{ color: 'var(--ink-3)', background: 'none', border: '1px solid var(--rule)', cursor: 'pointer', fontSize: '0.7rem', padding: '4px 10px', borderRadius: 'var(--radius)', fontFamily: 'var(--serif)' }}>
              Close
            </button>
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '12px', fontFamily: 'var(--mono)' }}>
            {viewingStatblock.creature_type && <span style={{ textTransform: 'capitalize' }}>{viewingStatblock.creature_type}</span>}
            {viewingStatblock.challenge_rating && <span>CR {viewingStatblock.challenge_rating}</span>}
            {viewingStatblock.armor_class != null && <span>AC {viewingStatblock.armor_class}{viewingStatblock.ac_descriptor ? ` (${viewingStatblock.ac_descriptor})` : ''}</span>}
            {viewingStatblock.hit_points != null && <span>HP {viewingStatblock.hit_points}{viewingStatblock.hit_dice ? ` (${viewingStatblock.hit_dice})` : ''}</span>}
            {viewingStatblock.speed && <span>Speed {viewingStatblock.speed}</span>}
          </div>

          {/* Ability scores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '12px' }}>
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ab => {
              const val = viewingStatblock[ab];
              const mod = abilityMod(val);
              return (
                <div key={ab} style={{
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 4px',
                  textAlign: 'center',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.68rem',
                }}>
                  <div style={{ color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{ab}</div>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{val ?? '—'}</div>
                  <div style={{ color: 'var(--ink-3)' }}>{mod >= 0 ? '+' : ''}{mod}</div>
                </div>
              );
            })}
          </div>

          {/* Traits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
            {[
              ['Saving Throws', viewingStatblock.saving_throws],
              ['Skills', viewingStatblock.skills],
              ['Resistances', viewingStatblock.damage_resistances],
              ['Immunities', viewingStatblock.damage_immunities],
              ['Cond. Immunities', viewingStatblock.condition_immunities],
              ['Senses', viewingStatblock.senses],
              ['Languages', viewingStatblock.languages],
            ].filter(([, v]) => !!v).map(([label, value]) => (
              <div key={label as string} style={{ fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{label}: </span>
                <span style={{ color: 'var(--ink-2)' }}>{value}</span>
              </div>
            ))}
          </div>

          {viewingStatblock.content && (
            <pre style={{
              fontSize: '0.72rem',
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--bg)',
              color: 'var(--ink-2)',
              lineHeight: '1.65',
              fontFamily: 'var(--mono)',
              border: '1px solid var(--rule)',
              margin: 0,
            }}>
              {viewingStatblock.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Button style helpers ─────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--bg)',
  backgroundColor: 'var(--gold)',
  border: '1px solid var(--gold)',
  borderRadius: 'var(--radius)',
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: 'var(--serif)',
};

const ghostBtn: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 500,
  color: 'var(--ink-2)',
  backgroundColor: 'transparent',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius)',
  padding: '6px 12px',
  cursor: 'pointer',
  fontFamily: 'var(--serif)',
};

const exitBtn: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--red)',
  backgroundColor: 'transparent',
  border: '1px solid var(--red-line)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  padding: '6px 12px',
  fontFamily: 'var(--serif)',
  marginLeft: '4px',
};

// ─── Combatant row ────────────────────────────────────────────────────────────
interface CombatantRowProps {
  c: Combatant;
  isCurrent: boolean;
  started: boolean;
  conditionMenuOpen: boolean;
  onSetInitiative: (id: string, value: number | null) => void;
  onViewStatblock: (sb: MonsterStatblock) => void;
  onToggleCondition: (id: string, cond: Condition) => void;
  onToggleConditionMenu: () => void;
  onRemove: (id: string) => void;
  onDamage: (id: string, n: number) => void;
  onHeal: (id: string, n: number) => void;
  onTemp: (id: string, n: number) => void;
  onSetHp: (id: string, n: number) => void;
  onSetMax: (id: string, n: number) => void;
  onDeathSave: (id: string, key: 's' | 'f', val: number) => void;
}

function CombatantRow({
  c, isCurrent, started, conditionMenuOpen,
  onSetInitiative, onViewStatblock, onToggleCondition, onToggleConditionMenu,
  onRemove, onDamage, onHeal, onTemp, onSetHp, onSetMax, onDeathSave,
}: CombatantRowProps) {
  const [val, setVal] = useState('');
  const [tempOpen, setTempOpen] = useState(false);
  const [tempVal, setTempVal] = useState('');

  // Inline editor for the current-HP number / the max-HP override.
  const [editing, setEditing] = useState<null | 'hp' | 'max'>(null);
  const [editVal, setEditVal] = useState('');
  const cancelNextBlur = useRef(false);

  const startEdit = (which: 'hp' | 'max') => {
    setEditing(which);
    setEditVal(String(which === 'hp' ? c.currentHp : c.maxHp));
  };
  const commitEdit = () => {
    const n = parseInt(editVal, 10);
    if (!isNaN(n) && n >= 0) {
      if (editing === 'hp') onSetHp(c.id, n); else if (editing === 'max') onSetMax(c.id, n);
    }
    setEditing(null); setEditVal('');
  };

  const hasMax = c.maxHp > 0;
  const down = hasMax && c.currentHp <= 0;
  const bloodied = hasMax && c.currentHp > 0 && c.currentHp <= c.maxHp / 2;
  const pct = hasMax ? clamp((c.currentHp / c.maxHp) * 100, 0, 100) : 0;
  const showTemp = c.temp > 0;
  const dead = c.conditions.has('dead');
  const stable = c.conditions.has('stable');

  const apply = (isHeal: boolean) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n <= 0) return;
    if (isHeal) onHeal(c.id, n); else onDamage(c.id, n);
    setVal('');
  };

  const commitTemp = () => {
    const n = parseInt(tempVal, 10);
    if (!isNaN(n) && n > 0) onTemp(c.id, n);
    setTempVal('');
    setTempOpen(false);
  };

  return (
    <div>
      {/* ── Row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: isCurrent ? '14px 24px 14px 21px' : '14px 24px',
          borderBottom: '1px solid var(--rule-soft)',
          borderLeft: isCurrent ? '3px solid var(--gold)' : '3px solid transparent',
          backgroundColor: isCurrent ? 'var(--gold-dim)' : 'transparent',
          opacity: down && !c.isPC ? 0.7 : 1,
          transition: 'background 0.15s, opacity 0.2s',
        }}
      >
        {/* Initiative */}
        <div style={{ width: '46px', flexShrink: 0, textAlign: 'center' }}>
          {!started ? (
            <input
              type="number"
              value={c.initiative ?? ''}
              onChange={e => onSetInitiative(c.id, e.target.value ? parseInt(e.target.value, 10) : null)}
              style={{
                width: '44px',
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--gold)',
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius)',
                padding: '2px 4px',
                outline: 'none',
                fontFamily: 'var(--mono)',
              }}
              placeholder="—"
            />
          ) : (
            <span style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: isCurrent ? 'var(--gold)' : 'var(--ink-4)',
              fontFamily: 'var(--mono)',
            }}>
              {c.initiative ?? '—'}
            </span>
          )}
        </div>

        {/* Name + meta + conditions */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: c.isPC ? 'var(--moss)' : 'var(--accent)' }}>
              {kindGlyph(c.isPC)}
            </span>
            <span
              style={{
                color: isCurrent ? 'var(--ink)' : down ? 'var(--ink-3)' : 'var(--ink-2)',
                fontSize: '0.95rem',
                fontWeight: 600,
                fontFamily: 'var(--display)',
                cursor: c.statblock ? 'pointer' : 'default',
                textDecoration: c.statblock ? 'underline dotted' : 'none',
                textUnderlineOffset: '3px',
                textDecorationColor: 'var(--rule-hover)',
              }}
              onClick={() => c.statblock && onViewStatblock(c.statblock)}
            >
              {c.name}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.66rem', color: 'var(--ink-3)', marginTop: '3px', display: 'flex', gap: '12px' }}>
            <span>{c.isPC ? 'Player' : 'Monster'}</span>
            {c.ac != null && <span>AC {c.ac}</span>}
          </div>
          {c.conditions.size > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
              {[...c.conditions].map(cond => (
                <span
                  key={cond}
                  onClick={() => onToggleCondition(c.id, cond)}
                  style={{
                    fontSize: '0.56rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: conditionColors[cond] ?? 'var(--ink-3)',
                    backgroundColor: `${conditionColors[cond] ?? 'var(--ink-3)'}1e`,
                    border: `1px solid ${conditionColors[cond] ?? 'var(--ink-3)'}55`,
                    borderRadius: '3px',
                    padding: '2px 7px',
                    cursor: 'pointer',
                    fontFamily: 'var(--mono)',
                  }}
                  title={`Remove ${cond}`}
                >
                  {cond}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── HP zone ── */}
        <div className="itk-hp">
          <div className="itk-hp-top">
            <div className="itk-hp-read">
              {editing === 'hp' ? (
                <input
                  className="itk-hp-edit num"
                  autoFocus
                  inputMode="numeric"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={e => e.currentTarget.select()}
                  onBlur={() => { if (cancelNextBlur.current) { cancelNextBlur.current = false; setEditing(null); } else commitEdit(); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { cancelNextBlur.current = true; e.currentTarget.blur(); } }}
                />
              ) : (
                <span className="itk-hp-num itk-hp-editable" style={{ color: hpColor(c.currentHp, c.maxHp) }} title="Click to set current HP" onClick={() => startEdit('hp')}>{c.currentHp}</span>
              )}
              {editing === 'max' ? (
                <input
                  className="itk-hp-edit max"
                  autoFocus
                  inputMode="numeric"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={e => e.currentTarget.select()}
                  onBlur={() => { if (cancelNextBlur.current) { cancelNextBlur.current = false; setEditing(null); } else commitEdit(); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { cancelNextBlur.current = true; e.currentTarget.blur(); } }}
                />
              ) : (
                <span className="itk-hp-max itk-hp-editable" title="Click to override max HP for this combat" onClick={() => startEdit('max')}>/{hasMax ? c.maxHp : '—'}</span>
              )}
              {showTemp && <span className="itk-hp-temp">+{c.temp} temp</span>}
            </div>
            {down ? (
              <span className="itk-hp-status down">{dead ? 'Dead' : stable ? 'Stable' : 'Down'}</span>
            ) : bloodied ? (
              <span className="itk-hp-status bloodied">Bloodied</span>
            ) : null}
          </div>

          {hasMax && (
            <div className={'itk-bar' + (showTemp ? ' hastemp' : '')}>
              <div className="itk-bar-fill" style={{ width: `${pct}%`, background: hpBarColor(pct) }} />
            </div>
          )}

          <div className="itk-hp-ctrl">
            <div className="itk-dh">
              <button className="dmg" onClick={() => apply(false)}>Damage</button>
              <input
                inputMode="numeric"
                value={val}
                placeholder="0"
                onChange={e => setVal(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(e.shiftKey); } }}
              />
              <button className="heal" onClick={() => apply(true)}>Heal</button>
            </div>
            <div className="itk-nudge">
              <button onClick={() => onHeal(c.id, 1)} title="+1">+1</button>
              <button onClick={() => onDamage(c.id, 1)} title="−1">−1</button>
            </div>
            <div className="itk-nudge">
              <button onClick={() => onHeal(c.id, 5)} title="+5">+5</button>
              <button onClick={() => onDamage(c.id, 5)} title="−5">−5</button>
            </div>
            <button className="itk-tempbtn" title="Add temporary HP" onClick={() => setTempOpen(o => !o)}>+T</button>
          </div>

          {tempOpen && (
            <div className="itk-temppop">
              <span className="hint">Temp HP</span>
              <input
                autoFocus
                inputMode="numeric"
                value={tempVal}
                placeholder="0"
                onChange={e => setTempVal(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') commitTemp(); if (e.key === 'Escape') setTempOpen(false); }}
              />
              <button onClick={commitTemp}>Set</button>
              <button className="x" onClick={() => setTempOpen(false)}>Cancel</button>
            </div>
          )}

          {down && c.isPC && !dead && !stable && (
            <div className="itk-death">
              <span className="lab">Death saves</span>
              <div className="itk-pips">
                {[0, 1, 2].map(i => (
                  <button
                    key={'s' + i}
                    className={'itk-pip s' + (c.deathSaves.s > i ? ' on' : '')}
                    title="Success"
                    onClick={() => onDeathSave(c.id, 's', c.deathSaves.s > i ? i : i + 1)}
                  />
                ))}
              </div>
              <div className="itk-pips">
                {[0, 1, 2].map(i => (
                  <button
                    key={'f' + i}
                    className={'itk-pip f' + (c.deathSaves.f > i ? ' on' : '')}
                    title="Failure"
                    onClick={() => onDeathSave(c.id, 'f', c.deathSaves.f > i ? i : i + 1)}
                  />
                ))}
              </div>
            </div>
          )}
          {down && c.isPC && (dead || stable) && (
            <div className="itk-death">
              <span className="itk-verdict" style={{ color: dead ? 'var(--red)' : 'var(--moss)' }}>
                {dead ? '✝ Dead' : '✓ Stabilized'}
              </span>
            </div>
          )}
        </div>

        {/* Trailing controls: condition toggle + remove */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={onToggleConditionMenu}
            title="Conditions"
            style={{
              color: c.conditions.size > 0 ? 'var(--gold)' : 'var(--ink-4)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ◉
          </button>
          <button
            onClick={() => onRemove(c.id)}
            title="Remove"
            style={{
              color: 'var(--rule-hover)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Condition picker */}
      {conditionMenuOpen && (
        <div style={{
          margin: '0 24px',
          padding: '10px 0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          borderBottom: '1px solid var(--rule-soft)',
        }}>
          {CONDITIONS.map(cond => {
            const active = c.conditions.has(cond);
            return (
              <button
                key={cond}
                onClick={() => onToggleCondition(c.id, cond)}
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  backgroundColor: active ? `${conditionColors[cond] ?? 'var(--gold)'}18` : 'transparent',
                  color: active ? (conditionColors[cond] ?? 'var(--gold)') : 'var(--ink-3)',
                  border: `1px solid ${active ? (conditionColors[cond] ?? 'var(--gold)') + '55' : 'var(--rule-soft)'}`,
                  transition: 'all 0.1s',
                }}
              >
                {cond}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── HP zone scoped styles (ported from the design prototype) ─────────────────
const HP_ZONE_CSS = `
.itk-hp{flex-shrink:0;width:334px}
.itk-hp-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}
.itk-hp-read{display:flex;align-items:baseline;gap:2px}
.itk-hp-num{font-family:var(--mono);font-weight:700;font-size:28px;line-height:1;letter-spacing:-.01em}
.itk-hp-max{font-family:var(--mono);font-size:14px;color:var(--ink-4)}
.itk-hp-editable{cursor:pointer;border-radius:4px;transition:background .1s}
.itk-hp-editable:hover{background:var(--gold-dim);text-decoration:underline dotted;text-underline-offset:3px}
.itk-hp-edit{font-family:var(--mono);font-weight:700;background:var(--bg-2);border:1px solid var(--gold-line);border-radius:5px;color:var(--ink);outline:none;text-align:center;padding:0 2px}
.itk-hp-edit.num{font-size:24px;width:64px;height:32px;line-height:1}
.itk-hp-edit.max{font-size:14px;width:48px;height:24px;color:var(--ink-3);margin-left:2px}
.itk-hp-temp{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--info);background:rgba(112,160,224,.12);border:1px solid rgba(112,160,224,.4);border-radius:999px;padding:2px 8px;margin-left:10px;white-space:nowrap}
.itk-hp-status{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.itk-hp-status.bloodied{color:var(--orange)}
.itk-hp-status.down{color:var(--red)}
.itk-bar{position:relative;height:9px;border-radius:5px;background:var(--rule-soft);overflow:hidden;margin-bottom:9px}
.itk-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;transition:width .25s ease}
.itk-bar.hastemp{box-shadow:0 0 0 1px rgba(112,160,224,.5)}
.itk-hp-ctrl{display:flex;align-items:stretch;gap:7px}
.itk-dh{flex:1;display:flex;align-items:center;border:1px solid var(--rule);border-radius:var(--radius);overflow:hidden;background:var(--paper);min-width:0}
.itk-dh button{flex-shrink:0;width:52px;border:none;cursor:pointer;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:0;height:40px;transition:.12s}
.itk-dh .dmg{background:rgba(224,92,92,.14);color:var(--red)}
.itk-dh .dmg:hover{background:rgba(224,92,92,.26)}
.itk-dh .heal{background:rgba(106,184,122,.14);color:var(--success)}
.itk-dh .heal:hover{background:rgba(106,184,122,.26)}
.itk-dh input{flex:1;min-width:0;width:100%;border:none;background:var(--bg-2);color:var(--ink);font-family:var(--mono);font-size:17px;font-weight:700;text-align:center;outline:none;height:40px;border-left:1px solid var(--rule);border-right:1px solid var(--rule)}
.itk-dh input::placeholder{color:var(--ink-4);font-weight:400}
.itk-nudge{display:flex;flex-direction:column;gap:4px}
.itk-nudge button{font-family:var(--mono);font-size:10px;color:var(--ink-2);background:var(--paper);border:1px solid var(--rule);border-radius:5px;cursor:pointer;transition:.12s;line-height:1;width:34px;height:18px}
.itk-nudge button:hover{border-color:var(--gold-line);color:var(--gold)}
.itk-tempbtn{font-family:var(--mono);font-size:10px;background:var(--paper);border:1px solid rgba(112,160,224,.3);border-radius:5px;cursor:pointer;transition:.12s;width:44px;height:40px;display:grid;place-items:center;color:var(--info)}
.itk-tempbtn:hover{background:rgba(112,160,224,.12);border-color:var(--info)}
.itk-death{display:flex;align-items:center;gap:14px;margin-top:9px}
.itk-death .lab{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.itk-pips{display:flex;gap:5px;align-items:center}
.itk-pip{width:14px;height:14px;border-radius:50%;border:1px solid var(--rule-hover);cursor:pointer;background:transparent;transition:.1s;padding:0}
.itk-pip.s.on{background:var(--success);border-color:var(--success)}
.itk-pip.f.on{background:var(--red);border-color:var(--red)}
.itk-verdict{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.itk-temppop{display:flex;gap:6px;align-items:center;margin-top:8px;padding:8px 10px;border:1px solid rgba(112,160,224,.35);background:rgba(112,160,224,.06);border-radius:var(--radius)}
.itk-temppop input{width:56px;height:30px;text-align:center;font-family:var(--mono);font-weight:700;background:var(--bg-2);border:1px solid var(--rule);border-radius:5px;color:var(--ink);outline:none}
.itk-temppop button{font-family:var(--mono);font-size:10px;padding:6px 10px;border-radius:5px;border:1px solid var(--info);background:rgba(112,160,224,.14);color:var(--info);cursor:pointer}
.itk-temppop .x{border-color:var(--rule);background:none;color:var(--ink-3)}
.itk-temppop .hint{font-family:var(--serif);font-style:italic;font-size:12px;color:var(--ink-3)}
`;
