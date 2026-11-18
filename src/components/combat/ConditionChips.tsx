// A combatant's conditions as chips (click one to clear it), and the two ways
// to add one, optionally for a number of rounds:
//   rail: a "+ condition" dropdown and a rounds field beside the chips.
//   full: chips only; the tracker opens <ConditionPicker> under the row.

import { useState, type CSSProperties } from 'react';
import { CONDITIONS, CONDITION_RULES, conditionTitle, type Combatant, type Condition } from '../../lib/combat';
import { conditionColors } from '../../lib/theme';
import type { Density } from './HpControl';
import './combat.css';

/** The condition's colour as --cc, for the chip's text, tint and border. */
const tone = (cond: Condition, fallback = 'var(--ink-3)') => ({ '--cc': conditionColors[cond] ?? fallback }) as CSSProperties;

export interface ConditionChipsProps {
  combatant: Combatant;
  density?: Density;
  /** Adds the condition if absent, clears it if present. */
  onToggle(c: Condition): void;
  /** Adds the condition for a number of rounds. */
  onSetRounds?(c: Condition, rounds: number): void;
  className?: string;
}

export function ConditionChips({ combatant: c, density = 'rail', onToggle, onSetRounds, className = '' }: ConditionChipsProps) {
  const [rounds, setRounds] = useState('');
  const rail = density === 'rail';
  if (!rail && c.conditions.length === 0) return null;

  const add = (cond: Condition) => {
    const n = parseInt(rounds, 10);
    if (n > 0 && onSetRounds) onSetRounds(cond, n); else onToggle(cond);
    setRounds('');
  };

  return (
    <div className={`cbt-conds is-${density} ${className}`.trim()}>
      {c.conditions.map(cond => {
        const left = c.rounds?.[cond];
        return (
          // eslint-disable-next-line no-restricted-syntax -- a condition chip in its condition's colour; clicking clears it
          <button key={cond} type="button" className="cbt-cond" style={tone(cond)}
            onClick={() => onToggle(cond)} title={`${conditionTitle(c, cond)}\n\nClick to clear.`} aria-label={`Clear ${cond}`}>
            {cond}{left ? <span className="cbt-cond-left"> · {left}</span> : null}{rail ? ' ×' : null}
          </button>
        );
      })}
      {rail && (
        <>
          <select className="cbt-cond-add" aria-label={`Add a condition to ${c.name}`} value=""
            onChange={e => { if (e.target.value) add(e.target.value as Condition); }}>
            <option value="">+ condition</option>
            {CONDITIONS.filter(x => !c.conditions.includes(x)).map(x => <option key={x} value={x} title={CONDITION_RULES[x]}>{x}</option>)}
          </select>
          {onSetRounds && (
            <input className="cbt-cond-rounds" type="number" min={1} max={100} value={rounds} onChange={e => setRounds(e.target.value)}
              placeholder="rds" aria-label={`Rounds for the next condition on ${c.name}`} title="Rounds it lasts (leave empty for until cleared)" />
          )}
        </>
      )}
    </div>
  );
}

/** Full density's add path: every condition as a toggle, and the rounds a new one lasts. */
export function ConditionPicker({ combatant: c, onToggle, onSetRounds, className = '' }: Omit<ConditionChipsProps, 'density'>) {
  const [rounds, setRounds] = useState('');
  const n = parseInt(rounds, 10);
  return (
    <div className={`cbt-picker ${className}`.trim()} role="group" aria-label={`Conditions for ${c.name}`}>
      {onSetRounds && (
        <label className="cbt-picker-rounds" title="Rounds a new condition lasts; leave empty for until cleared">
          for <input type="number" min={1} max={100} value={rounds} onChange={e => setRounds(e.target.value)} placeholder="∞" aria-label="Rounds" /> rounds
        </label>
      )}
      {CONDITIONS.map(cond => {
        const active = c.conditions.includes(cond);
        return (
          // eslint-disable-next-line no-restricted-syntax -- a condition toggle in its condition's colour when on
          <button key={cond} type="button" className={`cbt-pick${active ? ' on' : ''}`} style={tone(cond, 'var(--gold)')}
            title={CONDITION_RULES[cond]} aria-pressed={active}
            onClick={() => { if (!active && n > 0 && onSetRounds) onSetRounds(cond, n); else onToggle(cond); }}>
            {cond}
          </button>
        );
      })}
    </div>
  );
}
