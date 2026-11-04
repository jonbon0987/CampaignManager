// A thread's clock: read-only dots for a card, or segments to fill.

import { clockDots, type ThreadClock } from '../../lib/threadClock';

/** ●●●○○○, for a card or a list. */
export function ClockDots({ clock }: { clock: ThreadClock }) {
  const said = `${clock.filled} of ${clock.size}${clock.label ? ` toward ${clock.label}` : ''}`;
  return <span className={`clk-dots${clock.full ? ' is-full' : ''}`} role="img" aria-label={said} title={said}>{clockDots(clock)}</span>;
}

/** Click a segment to fill up to it; click the last filled one to empty it. */
export function ClockControl({ size, filled, onChange, name }: {
  size: number;
  filled: number;
  onChange: (filled: number) => void;
  /** What the segments' labels say it is. */
  name: string;
}) {
  return (
    <div className="clk" role="group" aria-label={name}>
      {Array.from({ length: size }, (_, i) => {
        const n = i + 1;
        const on = n <= filled;
        return (
          <button key={n} type="button" className={`clk-seg${on ? ' is-on' : ''}`} aria-pressed={on}
            aria-label={`${name}: ${n === filled ? `empty segment ${n}` : `fill to ${n}`} of ${size}`}
            onClick={() => onChange(n === filled ? n - 1 : n)} />
        );
      })}
      <span className="clk-count">{filled} of {size}</span>
    </div>
  );
}
