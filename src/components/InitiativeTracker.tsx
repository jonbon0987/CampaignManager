import { useState, useCallback, useMemo } from 'react';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../lib/database.types';

// ─── D&D 5e conditions ───────────────────────────────────────────────────────
const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
] as const;
type Condition = (typeof CONDITIONS)[number];

const conditionColors: Record<string, string> = {
  blinded: '#897f68', charmed: '#b070b0', deafened: '#897f68',
  frightened: '#c9a84c', grappled: '#c08060', incapacitated: '#897f68',
  invisible: '#70a0e0', paralyzed: '#e05c5c', petrified: '#897f68',
  poisoned: '#6ab87a', prone: '#c97a55', restrained: '#c08060',
  stunned: '#e0a060', unconscious: '#e05c5c', concentrating: '#70a0e0',
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Combatant {
  id: string;
  name: string;
  initiative: number | null;
  dexMod: number;
  maxHp: number;
  currentHp: number;
  ac: number | null;
  conditions: Set<Condition>;
  isPC: boolean;
  statblock: MonsterStatblock | null;
  notes: string | null;
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
  if (pct > 60) return 'linear-gradient(to right, #c97a55, #c9a84c)';
  if (pct > 25) return 'linear-gradient(to right, #c97a55, #e0a060)';
  return 'linear-gradient(to right, #e05c5c, #c97a55)';
}

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
  const [hpInputs, setHpInputs] = useState<Record<string, string>>({});
  const [addingCombatant, setAddingCombatant] = useState(false);
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

  const applyHpDelta = (id: string, delta: number) => {
    setCombatants(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newHp = c.maxHp > 0
        ? Math.max(0, Math.min(c.maxHp, c.currentHp + delta))
        : Math.max(0, c.currentHp + delta);
      const newConditions = new Set(c.conditions);
      if (newHp === 0 && !c.isPC) newConditions.add('unconscious');
      if (newHp > 0) newConditions.delete('unconscious');
      return { ...c, currentHp: newHp, conditions: newConditions };
    }));
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

  const applyHpInput = (id: string, isHeal: boolean) => {
    const n = parseInt(hpInputs[id] ?? '', 10);
    if (isNaN(n) || n <= 0) return;
    applyHpDelta(id, isHeal ? n : -n);
    setHpInputs(prev => ({ ...prev, [id]: '' }));
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#15120e', color: '#e8dcc4' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '24px',
        padding: '28px 32px 20px',
        borderBottom: '1px solid #2e2820',
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            color: '#897f68',
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
            color: '#e8dcc4',
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
            <div style={{ color: '#897f68', fontSize: '0.78rem', marginTop: '4px', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
              {currentCombatant.name}'s turn
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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

      {/* ── Combatant list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((c, idx) => {
          const isCurrent = started && idx === currentTurn;
          const isDown = c.currentHp === 0 && !c.isPC;
          const hpPct = c.maxHp > 0 ? Math.max(0, (c.currentHp / c.maxHp) * 100) : 100;
          const showHpBar = !c.isPC && c.maxHp > 0;

          return (
            <div key={c.id}>
              {/* ── Row ── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 24px 1fr 80px min-content',
                  alignItems: 'center',
                  gap: '12px',
                  padding: isCurrent ? '12px 14px 12px 11px' : '12px 14px',
                  borderBottom: '1px solid #1e1a14',
                  borderLeft: isCurrent ? '3px solid #c9a84c' : '3px solid transparent',
                  backgroundColor: isCurrent ? '#1c1814' : 'transparent',
                  opacity: isDown ? 0.45 : 1,
                  transition: 'background 0.15s, opacity 0.2s',
                }}
              >
                {/* Initiative */}
                <div style={{ textAlign: 'center' }}>
                  {!started ? (
                    <input
                      type="number"
                      value={c.initiative ?? ''}
                      onChange={e => setInitiative(c.id, e.target.value ? parseInt(e.target.value, 10) : null)}
                      style={{
                        width: '40px',
                        textAlign: 'center',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#c9a84c',
                        backgroundColor: '#1e1a14',
                        border: '1px solid #2e2820',
                        borderRadius: '3px',
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
                      color: isCurrent ? '#c9a84c' : '#5a5040',
                      fontFamily: 'var(--mono)',
                    }}>
                      {c.initiative ?? '—'}
                    </span>
                  )}
                </div>

                {/* Glyph */}
                <div style={{
                  fontSize: '1.1rem',
                  textAlign: 'center',
                  color: c.isPC ? '#c9a84c' : isCurrent ? '#897f68' : '#3a3020',
                }}>
                  {kindGlyph(c.isPC)}
                </div>

                {/* Name + conditions + HP bar */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: showHpBar ? '4px' : 0 }}>
                    <span
                      style={{
                        color: isCurrent ? '#e8dcc4' : isDown ? '#897f68' : c.isPC ? '#c9b88a' : '#c9b88a',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        fontFamily: 'var(--display)',
                        cursor: c.statblock ? 'pointer' : 'default',
                        textDecoration: c.statblock ? 'underline dotted' : 'none',
                        textUnderlineOffset: '3px',
                        textDecorationColor: '#3e3428',
                      }}
                      onClick={() => c.statblock && setViewingStatblock(c.statblock)}
                    >
                      {c.name}
                    </span>
                    {/* Condition pills */}
                    {[...c.conditions].map(cond => (
                      <span
                        key={cond}
                        onClick={() => toggleCondition(c.id, cond)}
                        style={{
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: conditionColors[cond] ?? '#897f68',
                          backgroundColor: `${conditionColors[cond] ?? '#897f68'}22`,
                          border: `1px solid ${conditionColors[cond] ?? '#897f68'}55`,
                          borderRadius: '2px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontFamily: 'var(--mono)',
                        }}
                        title={`Remove ${cond}`}
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                  {/* HP bar */}
                  {showHpBar && (
                    <div style={{ height: '3px', background: '#26211a', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${hpPct}%`,
                        background: hpBarColor(hpPct),
                        transition: 'width 0.25s ease',
                        borderRadius: '2px',
                      }} />
                    </div>
                  )}
                </div>

                {/* HP text */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {(!c.isPC || c.maxHp > 0) && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: '#897f68' }}>
                      <span style={{ color: isDown ? '#e05c5c' : '#b9ac90', fontWeight: 600 }}>{c.currentHp}</span>
                      {c.maxHp > 0 && <span style={{ color: '#3a3020' }}>/{c.maxHp}</span>}
                    </span>
                  )}
                </div>

                {/* Tools */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                  <input
                    type="number"
                    min={1}
                    value={hpInputs[c.id] ?? ''}
                    onChange={e => setHpInputs(prev => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="—"
                    onKeyDown={e => {
                      if (e.key === 'Enter') applyHpInput(c.id, false);
                    }}
                    style={{
                      width: '44px',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--mono)',
                      color: '#e8dcc4',
                      backgroundColor: '#1e1a14',
                      border: '1px solid #2e2820',
                      borderRadius: '3px',
                      padding: '3px 5px',
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                  <button onClick={() => applyHpInput(c.id, false)} style={dmgBtn} title="Apply damage">DMG</button>
                  <button onClick={() => applyHpInput(c.id, true)} style={healBtn} title="Apply healing">HEAL</button>
                  <button
                    onClick={() => setConditionMenuId(conditionMenuId === c.id ? null : c.id)}
                    title="Conditions"
                    style={{
                      color: c.conditions.size > 0 ? '#c9a84c' : '#3a3020',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      padding: '2px 4px',
                    }}
                  >
                    ◉
                  </button>
                  <button
                    onClick={() => removeCombatant(c.id)}
                    title="Remove"
                    style={{
                      color: '#2e2820',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      padding: '2px 3px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Condition picker */}
              {conditionMenuId === c.id && (
                <div style={{
                  margin: '0 14px',
                  padding: '10px 0',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  borderBottom: '1px solid #1e1a14',
                }}>
                  {CONDITIONS.map(cond => {
                    const active = c.conditions.has(cond);
                    return (
                      <button
                        key={cond}
                        onClick={() => toggleCondition(c.id, cond)}
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          padding: '3px 8px',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          fontFamily: 'var(--mono)',
                          backgroundColor: active ? `${conditionColors[cond] ?? '#c9a84c'}18` : 'transparent',
                          color: active ? (conditionColors[cond] ?? '#c9a84c') : '#897f68',
                          border: `1px solid ${active ? (conditionColors[cond] ?? '#c9a84c') + '55' : '#26211a'}`,
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
        })}

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
                  color: '#e8dcc4',
                  backgroundColor: '#1e1a14',
                  border: '1px solid #2e2820',
                  borderRadius: '3px',
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
                color: '#3a3020',
                fontSize: '0.72rem',
                fontFamily: 'var(--mono)',
                backgroundColor: 'transparent',
                border: '1px dashed #26211a',
                borderRadius: '3px',
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
          borderTop: '1px solid #2e2820',
          backgroundColor: '#1c1814',
          maxHeight: '38vh',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ color: '#897f68', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--mono)', marginBottom: '2px' }}>
                Stat Sheet
              </div>
              <h3 style={{ color: '#c9a84c', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--display)', margin: 0 }}>
                {viewingStatblock.name}
              </h3>
            </div>
            <button onClick={() => setViewingStatblock(null)}
              style={{ color: '#897f68', background: 'none', border: '1px solid #2e2820', cursor: 'pointer', fontSize: '0.7rem', padding: '4px 10px', borderRadius: '3px', fontFamily: 'var(--serif)' }}>
              Close
            </button>
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem', color: '#897f68', marginBottom: '12px', fontFamily: 'var(--mono)' }}>
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
                  backgroundColor: '#15120e',
                  border: '1px solid #2e2820',
                  borderRadius: '3px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.68rem',
                }}>
                  <div style={{ color: '#c9a84c', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{ab}</div>
                  <div style={{ color: '#e8dcc4', fontWeight: 600 }}>{val ?? '—'}</div>
                  <div style={{ color: '#897f68' }}>{mod >= 0 ? '+' : ''}{mod}</div>
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
                <span style={{ color: '#c9a84c', fontWeight: 700, fontFamily: 'var(--mono)' }}>{label}: </span>
                <span style={{ color: '#b9ac90' }}>{value}</span>
              </div>
            ))}
          </div>

          {viewingStatblock.content && (
            <pre style={{
              fontSize: '0.72rem',
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: '3px',
              backgroundColor: '#15120e',
              color: '#b9ac90',
              lineHeight: '1.65',
              fontFamily: 'var(--mono)',
              border: '1px solid #2e2820',
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
  color: '#15120e',
  backgroundColor: '#c9a84c',
  border: '1px solid #c9a84c',
  borderRadius: '3px',
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: 'var(--serif)',
};

const ghostBtn: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 500,
  color: '#b9ac90',
  backgroundColor: 'transparent',
  border: '1px solid #2e2820',
  borderRadius: '3px',
  padding: '6px 12px',
  cursor: 'pointer',
  fontFamily: 'var(--serif)',
};

const exitBtn: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#e05c5c',
  backgroundColor: 'transparent',
  border: '1px solid #4a2020',
  borderRadius: '3px',
  cursor: 'pointer',
  padding: '6px 12px',
  fontFamily: 'var(--serif)',
  marginLeft: '4px',
};

const dmgBtn: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#e05c5c',
  backgroundColor: '#1e1014',
  border: '1px solid #3a1a1a',
  borderRadius: '2px',
  padding: '3px 7px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
};

const healBtn: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#6ab87a',
  backgroundColor: '#141e14',
  border: '1px solid #1a3a1a',
  borderRadius: '2px',
  padding: '3px 7px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
};
