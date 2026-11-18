// Death saves: three success pips and three failure pips. Clicking a filled
// pip takes the count back to just below it; an empty one fills up to it.

import './combat.css';

export interface DeathSavePipsProps {
  successes: number;
  failures: number;
  onSet(kind: 's' | 'f', value: number): void;
  className?: string;
}

function Pips({ kind, label, value, onSet }: { kind: 's' | 'f'; label: string; value: number; onSet: (n: number) => void }) {
  return (
    <span className="cbt-pips" aria-label={`${label}: ${value} of 3`}>
      <span className="cbt-pips-label">{label}</span>
      {[1, 2, 3].map(n => (
        // eslint-disable-next-line no-restricted-syntax -- a death-save pip: a 12px dot, not a labelled button
        <button key={n} type="button" className={`cbt-pip is-${kind}${n <= value ? ' on' : ''}`}
          aria-label={`${label} ${n}`} aria-pressed={n <= value} onClick={() => onSet(n <= value ? n - 1 : n)} />
      ))}
    </span>
  );
}

export function DeathSavePips({ successes, failures, onSet, className = '' }: DeathSavePipsProps) {
  return (
    <div className={`cbt-saves ${className}`.trim()}>
      <Pips kind="s" label="Saves" value={successes} onSet={v => onSet('s', v)} />
      <Pips kind="f" label="Fails" value={failures} onSet={v => onSet('f', v)} />
    </div>
  );
}
