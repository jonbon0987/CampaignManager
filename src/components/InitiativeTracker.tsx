import { useState, useCallback, useMemo } from 'react';
import { Button } from './ui/Button';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../lib/database.types';

// ─── D&D 5e conditions ───────────────────────────────────────────────────────
const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
] as const;
type Condition = (typeof CONDITIONS)[number];

const conditionColors: Record<string, string> = {
  blinded: '#6a6490', charmed: '#b070b0', deafened: '#6a6490',
  frightened: '#c9a84c', grappled: '#c08060', incapacitated: '#6a6490',
  invisible: '#70a0e0', paralyzed: '#e05c5c', petrified: '#6a6490',
  poisoned: '#6ab87a', prone: '#c08060', restrained: '#c08060',
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

// ─── Component ───────────────────────────────────────────────────────────────
export function InitiativeTracker({ encounter, statblocks, pcNames = [], onClose }: InitiativeTrackerProps) {
  // Build initial combatant list from encounter data
  const initialCombatants = useMemo(() => {
    const result: Combatant[] = [];
    const encounterCombatants = parseCombatants(encounter.combatants);

    for (const ec of encounterCombatants) {
      const sb = ec.statblock_id ? statblocks.find(m => m.id === ec.statblock_id) : null;
      const dexMod = sb ? abilityMod(sb.dex) : 0;
      const maxHp = sb?.hit_points ?? 10;
      const ac = sb?.armor_class ?? null;

      for (let i = 0; i < ec.count; i++) {
        const suffix = ec.count > 1 ? ` ${i + 1}` : '';
        result.push({
          id: crypto.randomUUID(),
          name: `${ec.name}${suffix}`,
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

    // Add PCs
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
  const [currentTurn, setCurrentTurn] = useState<number>(-1); // -1 = not started
  const [round, setRound] = useState(1);
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);
  const [hpInput, setHpInput] = useState<Record<string, string>>({});
  const [conditionMenuId, setConditionMenuId] = useState<string | null>(null);
  const [addingCombatant, setAddingCombatant] = useState(false);
  const [newCombatantName, setNewCombatantName] = useState('');

  const started = currentTurn >= 0;

  // Sort by initiative (descending), breaking ties by dex mod
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
      initiative: c.isPC
        ? c.initiative // Don't override PC initiatives if already set
        : rollD20() + c.dexMod,
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

  const prevTurn = () => {
    if (currentTurn <= 0) {
      if (round > 1) {
        setCurrentTurn(sorted.length - 1);
        setRound(r => r - 1);
      }
    } else {
      setCurrentTurn(currentTurn - 1);
    }
  };

  const applyHp = (id: string, delta: number) => {
    setCombatants(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newHp = Math.max(0, Math.min(c.maxHp, c.currentHp + delta));
      const newConditions = new Set(c.conditions);
      if (newHp === 0 && !c.isPC) newConditions.add('unconscious');
      if (newHp > 0) newConditions.delete('unconscious');
      return { ...c, currentHp: newHp, conditions: newConditions };
    }));
    setHpInput(prev => ({ ...prev, [id]: '' }));
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
    // Adjust current turn if needed
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

  // Current combatant
  const currentCombatant = started ? sorted[currentTurn] ?? null : null;

  return (
    <div className="flex flex-col h-full" style={{ color: '#e8d5b0' }}>
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #3a3660', backgroundColor: '#14132a' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}>
            {encounter.name}
          </h2>
          {started && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#2a2040', color: '#c9a84c' }}>
              Round {round}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!started ? (
            <>
              <Button variant="secondary" size="sm" onClick={rollNPCInitiatives}>
                Roll NPCs
              </Button>
              <Button variant="secondary" size="sm" onClick={rollAllInitiatives}>
                Roll All
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={startCombat}
                disabled={!allHaveInitiative}
              >
                Start Combat
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={prevTurn}>
                ← Prev
              </Button>
              <Button variant="primary" size="sm" onClick={nextTurn}>
                Next →
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} style={{ color: '#6a6490' }}>
            ✕ End
          </Button>
        </div>
      </div>

      {/* ── Turn order list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {sorted.map((c, idx) => {
          const isCurrent = started && idx === currentTurn;
          const isDead = c.currentHp === 0 && !c.isPC;
          const hpPct = c.maxHp > 0 ? (c.currentHp / c.maxHp) * 100 : 100;
          const hpColor = hpPct > 50 ? '#6ab87a' : hpPct > 25 ? '#e0a060' : '#e05c5c';

          return (
            <div
              key={c.id}
              className="rounded-lg border p-3 transition-all"
              style={{
                backgroundColor: isCurrent ? '#1a1a3a' : isDead ? '#12111e' : '#1a1828',
                borderColor: isCurrent ? '#c9a84c' : '#2e2c4a',
                opacity: isDead ? 0.5 : 1,
                boxShadow: isCurrent ? '0 0 12px rgba(201, 168, 76, 0.15)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Initiative */}
                <div className="w-10 text-center shrink-0">
                  {!started ? (
                    <input
                      type="number"
                      value={c.initiative ?? ''}
                      onChange={e => setInitiative(c.id, e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-10 text-center text-sm rounded outline-none"
                      style={{
                        backgroundColor: '#0f0e17',
                        color: '#c9a84c',
                        border: '1px solid #3a3660',
                        fontWeight: 700,
                        padding: '2px',
                      }}
                      placeholder="—"
                    />
                  ) : (
                    <span
                      className="text-lg font-bold"
                      style={{ color: isCurrent ? '#c9a84c' : '#6a6490' }}
                    >
                      {c.initiative ?? '—'}
                    </span>
                  )}
                </div>

                {/* Turn indicator */}
                {isCurrent && (
                  <span className="text-xs" style={{ color: '#c9a84c' }}>▶</span>
                )}

                {/* Name + info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold text-sm cursor-pointer"
                      style={{
                        color: c.isPC ? '#70a0e0' : '#e8d5b0',
                        fontFamily: 'Georgia, Cambria, serif',
                        textDecoration: c.statblock ? 'underline dotted' : 'none',
                        textUnderlineOffset: '3px',
                      }}
                      onClick={() => c.statblock && setViewingStatblock(c.statblock)}
                      title={c.statblock ? 'View stat block' : undefined}
                    >
                      {c.name}
                    </span>
                    {c.isPC && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1a2a4a', color: '#70a0e0', fontSize: '0.6rem' }}>
                        PC
                      </span>
                    )}
                    {c.ac != null && (
                      <span className="text-xs" style={{ color: '#6a6490' }}>
                        AC {c.ac}
                      </span>
                    )}
                  </div>

                  {/* Conditions */}
                  {c.conditions.size > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {[...c.conditions].map(cond => (
                        <span
                          key={cond}
                          className="text-xs px-1.5 py-0.5 rounded cursor-pointer capitalize"
                          style={{
                            backgroundColor: '#0f0e17',
                            color: conditionColors[cond] ?? '#9990b0',
                            border: `1px solid ${conditionColors[cond] ?? '#3a3660'}40`,
                          }}
                          onClick={() => toggleCondition(c.id, cond)}
                          title={`Remove ${cond}`}
                        >
                          {cond} ✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* HP bar (NPCs only) */}
                {!c.isPC && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* HP display + bar */}
                    <div className="w-24">
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span style={{ color: hpColor, fontWeight: 600 }}>
                          {c.currentHp}
                        </span>
                        <span style={{ color: '#4a4470' }}>/ {c.maxHp}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#0f0e17' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${hpPct}%`, backgroundColor: hpColor }}
                        />
                      </div>
                    </div>

                    {/* Damage / Heal inputs */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={hpInput[c.id] ?? ''}
                        onChange={e => setHpInput(prev => ({ ...prev, [c.id]: e.target.value }))}
                        className="w-12 text-center text-xs rounded outline-none"
                        style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', padding: '3px 2px' }}
                        placeholder="#"
                        min={0}
                      />
                      <button
                        onClick={() => applyHp(c.id, -(parseInt(hpInput[c.id] || '0', 10)))}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#3a1a1a', color: '#e05c5c', border: '1px solid #5a2a2a' }}
                        title="Deal damage"
                      >
                        −
                      </button>
                      <button
                        onClick={() => applyHp(c.id, parseInt(hpInput[c.id] || '0', 10))}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#1a2a1a', color: '#6ab87a', border: '1px solid #2a5a2a' }}
                        title="Heal"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setConditionMenuId(conditionMenuId === c.id ? null : c.id)}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                    title="Conditions"
                  >
                    ◉
                  </button>
                  <button
                    onClick={() => removeCombatant(c.id)}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Condition picker dropdown */}
              {conditionMenuId === c.id && (
                <div
                  className="mt-2 pt-2 flex flex-wrap gap-1"
                  style={{ borderTop: '1px solid #2e2c4a' }}
                >
                  {CONDITIONS.map(cond => {
                    const active = c.conditions.has(cond);
                    return (
                      <button
                        key={cond}
                        onClick={() => toggleCondition(c.id, cond)}
                        className="text-xs px-2 py-1 rounded capitalize transition-colors"
                        style={{
                          backgroundColor: active ? '#2a2040' : '#0f0e17',
                          color: active ? (conditionColors[cond] ?? '#c9a84c') : '#6a6490',
                          border: `1px solid ${active ? (conditionColors[cond] ?? '#c9a84c') + '60' : '#2e2c4a'}`,
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

        {/* Add combatant */}
        <div className="pt-2">
          {addingCombatant ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCombatantName}
                onChange={e => setNewCombatantName(e.target.value)}
                placeholder="Combatant name..."
                autoFocus
                className="flex-1 text-sm rounded outline-none px-2 py-1"
                style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') addNewCombatant();
                  if (e.key === 'Escape') setAddingCombatant(false);
                }}
              />
              <Button variant="primary" size="sm" onClick={addNewCombatant}>Add</Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingCombatant(false)}>Cancel</Button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCombatant(true)}
              className="text-xs w-full py-2 rounded border border-dashed transition-colors"
              style={{ color: '#6a6490', borderColor: '#3a3660', backgroundColor: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#c9a84c'; e.currentTarget.style.borderColor = '#c9a84c'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6a6490'; e.currentTarget.style.borderColor = '#3a3660'; }}
            >
              + Add Combatant
            </button>
          )}
        </div>
      </div>

      {/* ── Stat block viewer (side panel style) ── */}
      {viewingStatblock && (
        <div
          className="shrink-0 overflow-y-auto px-4 py-3"
          style={{
            borderTop: '1px solid #3a3660',
            backgroundColor: '#14132a',
            maxHeight: '40vh',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm" style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}>
              {viewingStatblock.name}
            </h3>
            <button
              onClick={() => setViewingStatblock(null)}
              className="text-xs"
              style={{ color: '#6a6490', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕ Close
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs mb-2" style={{ color: '#6a6490' }}>
            {viewingStatblock.creature_type && <span className="capitalize">{viewingStatblock.creature_type}</span>}
            {viewingStatblock.challenge_rating && <span>CR {viewingStatblock.challenge_rating}</span>}
            {viewingStatblock.armor_class != null && <span>AC {viewingStatblock.armor_class}{viewingStatblock.ac_descriptor ? ` (${viewingStatblock.ac_descriptor})` : ''}</span>}
            {viewingStatblock.hit_points != null && <span>HP {viewingStatblock.hit_points}{viewingStatblock.hit_dice ? ` (${viewingStatblock.hit_dice})` : ''}</span>}
            {viewingStatblock.speed && <span>Speed {viewingStatblock.speed}</span>}
          </div>

          {/* Ability scores */}
          <div className="grid grid-cols-6 gap-1 text-center mb-3" style={{ fontSize: '0.7rem' }}>
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ab => {
              const val = viewingStatblock[ab];
              const mod = abilityMod(val);
              return (
                <div key={ab} className="rounded py-1" style={{ backgroundColor: '#0f0e17', border: '1px solid #2e2c4a' }}>
                  <div style={{ color: '#c9a84c', fontWeight: 700, textTransform: 'uppercase' }}>{ab}</div>
                  <div style={{ color: '#e8d5b0', fontWeight: 600 }}>{val ?? '—'}</div>
                  <div style={{ color: '#6a6490' }}>({mod >= 0 ? '+' : ''}{mod})</div>
                </div>
              );
            })}
          </div>

          {/* Stat details */}
          {viewingStatblock.saving_throws && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Saves:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.saving_throws}</span></div>
          )}
          {viewingStatblock.skills && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Skills:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.skills}</span></div>
          )}
          {viewingStatblock.damage_resistances && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Resistances:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.damage_resistances}</span></div>
          )}
          {viewingStatblock.damage_immunities && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Immunities:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.damage_immunities}</span></div>
          )}
          {viewingStatblock.condition_immunities && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Cond. Immunities:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.condition_immunities}</span></div>
          )}
          {viewingStatblock.senses && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Senses:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.senses}</span></div>
          )}
          {viewingStatblock.languages && (
            <div className="text-xs mb-1"><span style={{ color: '#c9a84c', fontWeight: 600 }}>Languages:</span> <span style={{ color: '#c9b88a' }}>{viewingStatblock.languages}</span></div>
          )}

          {/* Actions content */}
          {viewingStatblock.content && (
            <pre
              className="text-xs whitespace-pre-wrap mt-2 p-2 rounded"
              style={{
                backgroundColor: '#0f0e17',
                color: '#c9b88a',
                lineHeight: '1.6',
                fontFamily: 'Georgia, serif',
                border: '1px solid #2e2c4a',
              }}
            >
              {viewingStatblock.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
