// A combatant's conditions as chips (click one to clear it), and the control
// that adds one, optionally for a number of rounds.

import { useState } from 'react';
import { CONDITIONS, CONDITION_RULES, conditionTitle, type Combatant, type Condition } from '../../lib/combat';
import { conditionColors } from '../../lib/theme';
import './combat.css';

export interface ConditionChipsProps {
  combatant: Combatant;
  /** Adds the condition if absent, clears it if present. */
  onToggle(c: Condition): void;
  /** Adds the condition for a number of rounds. */
  onSetRounds?(c: Condition, rounds: number): void;
  className?: string;
}

export function ConditionChips({ combatant: c, onToggle, onSetRounds, className = '' }: ConditionChipsProps) {
  const [rounds, setRounds] = useState('');

  const add = (cond: Condition) => {
    const n = parseInt(rounds, 10);
    if (n > 0 && onSetRounds) onSetRounds(cond, n); else onToggle(cond);
    setRounds('');
  };

  return (
    <div className={`cbt-conds ${className}`.trim()}>
      {c.conditions.map(cond => {
        const left = c.rounds?.[cond];
        return (
          // eslint-disable-next-line no-restricted-syntax -- a condition chip in its condition's colour; clicking clears it
          <button key={cond} type="button" className="cbt-cond" style={{ color: conditionColors[cond], borderColor: conditionColors[cond] }}
            onClick={() => onToggle(cond)} title={`${conditionTitle(c, cond)}\n\nClick to clear.`} aria-label={`Clear ${cond}`}>
            {cond}{left ? <span className="cbt-cond-left"> · {left}</span> : null} ×
          </button>
        );
      })}
      <select className="cbt-cond-add" aria-label={`Add a condition to ${c.name}`} value=""
        onChange={e => { if (e.target.value) add(e.target.value as Condition); }}>
        <option value="">+ condition</option>
        {CONDITIONS.filter(x => !c.conditions.includes(x)).map(x => <option key={x} value={x} title={CONDITION_RULES[x]}>{x}</option>)}
      </select>
      {onSetRounds && (
        <input className="cbt-cond-rounds" type="number" min={1} max={100} value={rounds} onChange={e => setRounds(e.target.value)}
          placeholder="rds" aria-label={`Rounds for the next condition on ${c.name}`} title="Rounds it lasts (leave empty for until cleared)" />
      )}
    </div>
  );
}
