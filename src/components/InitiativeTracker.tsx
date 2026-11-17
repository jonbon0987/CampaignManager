import { useState, useRef } from 'react';
import type { Encounter, MonsterStatblock } from '../lib/database.types';
import {
  CONDITIONS, CONDITION_RULES, clamp, conditionTitle,
  combatantsFromEncounter, combatantsFromParty, newCombatant,
  type Combatant, type Condition, type Fight, type PartyMember,
} from '../lib/combat';
import { useFight } from '../hooks/useFight';
import { useStatBlockPanel } from '../context/StatBlockPanelContext';
import { useConfirm } from '../context/ConfirmContext';
import { plural } from '../lib/plural';
import StatBlockPanel from './StatBlockPanel';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { onActivate } from '../lib/activate';
import { conditionColors } from '../lib/theme';
import './initiativeTracker.css';

interface InitiativeTrackerProps {
  encounter: Encounter;
  statblocks: MonsterStatblock[];
  party?: PartyMember[];
  onClose: () => void;
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

// Big-number readout color: red when down, orange when bloodied, ink when healthy.
// A combatant with no max (unconfigured PC HP) reads as neutral, never "down".
function hpColor(hp: number, max: number): string {
  if (max <= 0) return 'var(--ink-2)';
  if (hp <= 0) return 'var(--red)';
  return hp <= max / 2 ? 'var(--orange)' : 'var(--ink)';
}

// ─── Component ───────────────────────────────────────────────────────────────
// The full-screen runner for an encounter. Its rules live in lib/combat, shared
// with Play's docked tracker.
export function InitiativeTracker({ encounter, statblocks, party = [], onClose }: InitiativeTrackerProps) {
  const [fight, setFight] = useState<Fight>(() => ({
    combatants: [...combatantsFromEncounter(encounter, statblocks), ...combatantsFromParty(party)],
    turn: -1,
    round: 1,
  }));
  const f = useFight(fight, setFight);
  const { openStatBlock, activeStatBlockId, closeStatBlock } = useStatBlockPanel();
  const confirm = useConfirm();
  const [conditionMenuId, setConditionMenuId] = useState<string | null>(null);
  const [addingCombatant, setAddingCombatant] = useState(false);
  const [newCombatantName, setNewCombatantName] = useState('');

  const { started, order: sorted, historyLen, undo } = f;
  const currentTurn = fight.turn;
  const round = fight.round;
  const statblockFor = (c: Combatant) => (c.statblockId ? statblocks.find(s => s.id === c.statblockId) ?? null : null);

  const addNewCombatant = () => {
    if (!newCombatantName.trim()) return;
    f.add([newCombatant(newCombatantName.trim())]);
    setNewCombatantName('');
    setAddingCombatant(false);
  };

  // A fight under way is only in memory here, so ending it asks first. Either
  // way the stat sheet docked beside it closes with it.
  const endFight = async () => {
    if (started) {
      const foes = fight.combatants.filter(c => !c.isPC);
      const down = foes.filter(c => c.currentHp <= 0).length;
      const ok = await confirm({
        title: 'End this fight?',
        message: `Round ${round}${foes.length > 0 ? `, ${down} of ${plural(foes.length, 'foe')} down` : ''}. The tracker isn’t kept once it closes.`,
        confirmLabel: 'End fight',
      });
      if (!ok) return;
    }
    closeStatBlock();
    onClose();
  };

  const allHaveInitiative = fight.combatants.every(c => c.initiative !== null);
  const currentCombatant = f.current;

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

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
            fontSize: 'var(--fs-micro)',
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
            fontSize: 'var(--fs-h2)',
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
            <div style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-xs)', marginTop: '4px', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
              {currentCombatant.name}'s turn
            </div>
          )}
          {!!fight.expired?.length && (
            <div role="status" style={{ color: 'var(--gold)', fontSize: 'var(--fs-xs)', marginTop: '2px', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
              {fight.expired.map(e => `${e.name} is no longer ${e.conditions.join(' or ')}`).join(' · ')}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Button variant="secondary" size="sm" onClick={undo} disabled={historyLen === 0} title="Undo last HP change">
            ↺ Undo{historyLen > 0 ? ` (${historyLen})` : ''}
          </Button>
          {!started ? (
            <>
              <Button variant="secondary" size="sm" onClick={f.rollNPCs}>Roll NPCs</Button>
              <Button variant="secondary" size="sm" onClick={f.rollAll}>Roll All</Button>
              <Button variant="primary" size="sm" onClick={f.start} disabled={!allHaveInitiative}>
                Start Combat
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={f.reset}>Reset</Button>
              <Button variant="primary" size="sm" onClick={f.next}>Next turn ▶</Button>
            </>
          )}
          <Button variant="danger" size="sm" onClick={() => void endFight()}>✕ End</Button>
        </div>
      </div>

      {/* Scoped styles for the HP zone (hover / focus / placeholder states that
          inline styles can't express). Prefixed `itk-` to avoid collisions. */}

      {/* ── Combatant list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((c, idx) => (
          <CombatantRow
            key={c.id}
            c={c}
            isCurrent={started && idx === currentTurn}
            started={started}
            conditionMenuOpen={conditionMenuId === c.id}
            statblock={statblockFor(c)}
            onSetInitiative={f.setInitiative}
            onViewStatblock={sb => openStatBlock(sb.id)}
            onToggleCondition={f.toggleCondition}
            onSetConditionRounds={f.setConditionRounds}
            onResolveConcentration={f.resolveConcentration}
            onToggleConditionMenu={() => setConditionMenuId(conditionMenuId === c.id ? null : c.id)}
            onRemove={f.remove}
            onDamage={f.damage}
            onHeal={f.heal}
            onTemp={f.addTemp}
            onSetHp={f.setHp}
            onSetMax={f.setMax}
            onDeathSave={f.deathSave}
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
                // eslint-disable-next-line no-restricted-syntax -- tracker add-combatant field; moves to the shared combatant parts (phase 8)
                style={{
                  flex: 1,
                  fontSize: 'var(--fs-md)',
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
              <Button variant="primary" size="sm" onClick={addNewCombatant}>Add</Button>
              <Button variant="secondary" size="sm" onClick={() => setAddingCombatant(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="w-full border-dashed" onClick={() => setAddingCombatant(true)}>
              + Add Combatant
            </Button>
          )}
        </div>
      </div>
    </div>

      {/* The stat sheet, docked beside the fight as it is beside the app */}
      {activeStatBlockId && (
        <div style={{ width: 340, flexShrink: 0 }}>
          <StatBlockPanel statblocks={statblocks} />
        </div>
      )}
    </div>
  );
}

// ─── Button style helpers ─────────────────────────────────────────────────────

// ─── Combatant row ────────────────────────────────────────────────────────────
interface CombatantRowProps {
  c: Combatant;
  statblock: MonsterStatblock | null;
  isCurrent: boolean;
  started: boolean;
  conditionMenuOpen: boolean;
  onSetInitiative: (id: string, value: number | null) => void;
  onViewStatblock: (sb: MonsterStatblock) => void;
  onToggleCondition: (id: string, cond: Condition) => void;
  onSetConditionRounds: (id: string, cond: Condition, rounds: number | null) => void;
  onResolveConcentration: (id: string, held: boolean) => void;
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
  c, statblock, isCurrent, started, conditionMenuOpen,
  onSetInitiative, onViewStatblock, onToggleCondition, onSetConditionRounds, onResolveConcentration, onToggleConditionMenu,
  onRemove, onDamage, onHeal, onTemp, onSetHp, onSetMax, onDeathSave,
}: CombatantRowProps) {
  const [val, setVal] = useState('');
  const [rounds, setRounds] = useState('');
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
  const dead = c.conditions.includes('dead');
  const stable = c.conditions.includes('stable');

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
              // eslint-disable-next-line no-restricted-syntax -- tracker initiative number; moves to the shared combatant parts (phase 8)
              style={{
                width: '44px',
                textAlign: 'center',
                fontSize: 'var(--fs-body)',
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
              fontSize: 'var(--fs-lg)',
              fontWeight: 700,
              color: isCurrent ? 'var(--gold)' : 'var(--ink-3)',
              fontFamily: 'var(--mono)',
            }}>
              {c.initiative ?? '—'}
            </span>
          )}
        </div>

        {/* Name + meta + conditions */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: c.isPC ? 'var(--moss)' : 'var(--accent)' }}>
              {kindGlyph(c.isPC)}
            </span>
            <span
              style={{
                color: isCurrent ? 'var(--ink)' : down ? 'var(--ink-3)' : 'var(--ink-2)',
                fontSize: 'var(--fs-body)',
                fontWeight: 600,
                fontFamily: 'var(--display)',
                cursor: statblock ? 'pointer' : 'default',
                textDecoration: statblock ? 'underline dotted' : 'none',
                textUnderlineOffset: '3px',
                textDecorationColor: 'var(--rule-hover)',
              }}
              onClick={() => statblock && onViewStatblock(statblock)}
              {...(statblock ? { role: 'button', tabIndex: 0, title: 'Open the stat block', onKeyDown: onActivate(() => onViewStatblock(statblock)) } : {})}
            >
              {c.name}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-label)', color: 'var(--ink-3)', marginTop: '3px', display: 'flex', gap: '12px' }}>
            <span>{c.isPC ? 'Player' : 'Monster'}</span>
            {c.ac != null && <span>AC {c.ac}</span>}
          </div>
          {c.conditions.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
              {[...c.conditions].map(cond => (
                <span
                  key={cond}
                  // eslint-disable-next-line no-restricted-syntax -- condition chip removes on click; the Conditions menu toggles the same from the keyboard. Shared ConditionChips in phase 8
                  onClick={() => onToggleCondition(c.id, cond)}
                  style={{
                    fontSize: 'var(--fs-micro)',
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
                  title={`${conditionTitle(c, cond)}\n\nClick to remove.`}
                >
                  {cond}{c.rounds?.[cond] ? ` · ${c.rounds[cond]}` : ''}
                </span>
              ))}
            </div>
          )}
          {c.conCheck != null && (
            <div className="itk-con" role="alert">
              ◎ Concentration: Con save, DC {c.conCheck}
              <button onClick={() => onResolveConcentration(c.id, true)}>Held</button>
              <button onClick={() => onResolveConcentration(c.id, false)}>Lost</button>
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
                <span className="itk-hp-num itk-hp-editable" style={{ color: hpColor(c.currentHp, c.maxHp) }} title="Click to set current HP"
                  // eslint-disable-next-line no-restricted-syntax -- click-to-edit HP; the Damage / Heal field is the keyboard path. Shared HpControl in phase 8
                  onClick={() => startEdit('hp')}>{c.currentHp}</span>
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
                <span className="itk-hp-max itk-hp-editable" title="Click to override max HP for this combat"
                  // eslint-disable-next-line no-restricted-syntax -- click-to-edit max HP; shared HpControl in phase 8
                  onClick={() => startEdit('max')}>/{hasMax ? c.maxHp : '—'}</span>
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
              <button
                // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
                className="dmg" onClick={() => apply(false)}>Damage</button>
              <input
                inputMode="numeric"
                value={val}
                placeholder="0"
                onChange={e => setVal(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(e.shiftKey); } }}
              />
              <button
                // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
                className="heal" onClick={() => apply(true)}>Heal</button>
            </div>
            <div className="itk-nudge">
              <button onClick={() => onHeal(c.id, 1)} title="+1">+1</button>
              <button onClick={() => onDamage(c.id, 1)} title="−1">−1</button>
            </div>
            <div className="itk-nudge">
              <button onClick={() => onHeal(c.id, 5)} title="+5">+5</button>
              <button onClick={() => onDamage(c.id, 5)} title="−5">−5</button>
            </div>
            <button
              // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
              className="itk-tempbtn" title="Add temporary HP" onClick={() => setTempOpen(o => !o)}>+T</button>
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
              <button
                // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
                className="x" onClick={() => setTempOpen(false)}>Cancel</button>
            </div>
          )}

          {down && c.isPC && !dead && !stable && (
            <div className="itk-death">
              <span className="lab">Death saves</span>
              <div className="itk-pips">
                {[0, 1, 2].map(i => (
                  <button
                    key={'s' + i}
                    // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
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
                    // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
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
          <IconButton active={c.conditions.length > 0} aria-label="Conditions" onClick={onToggleConditionMenu} title="Conditions" style={{ width: 26, height: 26, fontSize: 'var(--fs-md)' }}>
            ◉
          </IconButton>
          <IconButton aria-label="Remove combatant" onClick={() => onRemove(c.id)} title="Remove" style={{ width: 26, height: 26, fontSize: 'var(--fs-xs)' }}>
            ✕
          </IconButton>
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
          <label className="itk-rounds" title="Rounds a new condition lasts; leave empty for until cleared">
            for <input type="number" min={1} max={100} value={rounds} onChange={e => setRounds(e.target.value)} placeholder="∞" aria-label="Rounds" /> rounds
          </label>
          {CONDITIONS.map(cond => {
            const active = c.conditions.includes(cond);
            const n = parseInt(rounds, 10);
            return (
              <button
                key={cond}
                title={CONDITION_RULES[cond]}
                onClick={() => { if (!active && n > 0) onSetConditionRounds(c.id, cond, n); else onToggleCondition(c.id, cond); }}
                // eslint-disable-next-line no-restricted-syntax -- bespoke combatant control; moves to the shared HpControl / DeathSavePips / ConditionChips parts (phase 8)
                style={{
                  fontSize: 'var(--fs-micro)',
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
