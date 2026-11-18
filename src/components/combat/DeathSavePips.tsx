// Death saves: three success pips and three failure pips. Clicking a filled
// pip takes the count back to just below it; an empty one fills up to it.
//   rail: each row of pips labelled "Saves" / "Fails".
//   full: one "Death saves" label and larger pips.

import type { Density } from './HpControl';
import './combat.css';

export interface DeathSavePipsProps {
  successes: number;
  failures: number;
  onSet(kind: 's' | 'f', value: number): void;
  density?: Density;
  className?: string;
}

function Pips({ kind, label, value, onSet, showLabel }: { kind: 's' | 'f'; label: string; value: number; onSet: (n: number) => void; showLabel: boolean }) {
  return (
    <span className="cbt-pips" role="group" aria-label={`${label}: ${value} of 3`}>
      {showLabel && <span className="cbt-pips-label" aria-hidden>{label}</span>}
      {[1, 2, 3].map(n => (
        // eslint-disable-next-line no-restricted-syntax -- a death-save pip: a small dot, not a labelled button
        <button key={n} type="button" className={`cbt-pip is-${kind}${n <= value ? ' on' : ''}`}
          aria-label={`${label} ${n}`} aria-pressed={n <= value} title={kind === 's' ? 'Success' : 'Failure'}
          onClick={() => onSet(n <= value ? n - 1 : n)} />
      ))}
    </span>
  );
}

export function DeathSavePips({ successes, failures, onSet, density = 'rail', className = '' }: DeathSavePipsProps) {
  const rail = density === 'rail';
  return (
    <div className={`cbt-saves is-${density} ${className}`.trim()}>
      {!rail && <span className="cbt-saves-label">Death saves</span>}
      <Pips kind="s" label="Saves" value={successes} onSet={v => onSet('s', v)} showLabel={rail} />
      <Pips kind="f" label="Fails" value={failures} onSet={v => onSet('f', v)} showLabel={rail} />
    </div>
  );
}
