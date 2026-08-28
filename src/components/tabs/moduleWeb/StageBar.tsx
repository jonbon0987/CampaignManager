/* moduleWeb/StageBar.tsx — the floating control bar over the stage:
   Reveal depth, gravity, status filters, counts, Settle and Fit. */
import type { Module } from '../../../lib/database.types';

export type Depth = 'modules' | 'subs' | 'scenes' | 'custom';
export type Status = Module['status'];

const STATUS_CHIPS: [Status, string, string][] = [
  ['completed', 'Complete', 'var(--moss)'],
  ['active',    'Active',   'var(--gold)'],
  ['planned',   'Planned',  'var(--ink-3)'],
];

const DEPTHS: [Exclude<Depth, 'custom'>, string][] = [
  ['modules', 'Chapters'], ['subs', 'Parts'], ['scenes', 'Scenes'],
];

export function StageBar({ depth, setDepth, gravity, setGravity, filters, toggleFilter, counts, onFit, onSettle }: {
  depth: Depth;
  setDepth: (d: Exclude<Depth, 'custom'>) => void;
  gravity: number;
  setGravity: (g: number) => void;
  filters: Set<Status>;
  toggleFilter: (s: Status) => void;
  counts: { modules: number; subs: number; scenes: number };
  onFit: () => void;
  onSettle: () => void;
}) {
  return (
    <div className="orr-bar">
      <div className="orr-bar-group">
        <span className="orr-bar-label">Reveal</span>
        <div className="orr-seg">
          {DEPTHS.map(([v, l]) => (
            // eslint-disable-next-line no-restricted-syntax -- bespoke segmented-control segment
            <button key={v} className={`orr-seg-btn ${depth === v ? 'is-active' : ''}`} onClick={() => setDepth(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="orr-bar-group">
        <span className="orr-bar-label">Gravity</span>
        <input className="orr-slider" type="range" min="0.35" max="1.9" step="0.05" aria-label="Gravity"
          value={gravity} onChange={e => setGravity(parseFloat(e.target.value))} />
        <span className="orr-bar-val">{gravity < 0.7 ? 'loose' : gravity > 1.35 ? 'tight' : 'even'}</span>
      </div>
      <div className="orr-bar-group">
        {STATUS_CHIPS.map(([k, l, c]) => (
          // eslint-disable-next-line no-restricted-syntax -- bespoke status filter pill with a colour dot
          <button key={k} className={`orr-chip ${filters.has(k) ? '' : 'is-off'}`}
            aria-pressed={filters.has(k)} onClick={() => toggleFilter(k)}>
            <span className="orr-chip-dot" style={{ background: c }} />{l}
          </button>
        ))}
      </div>
      <div className="orr-bar-spacer" />
      <div className="orr-bar-group">
        <span className="orr-bar-count">{counts.modules} chapters · {counts.subs} parts · {counts.scenes} scenes</span>
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke stage-bar control sized to the floating bar */}
        <button className="orr-btn" onClick={onSettle} title="Re-run the simulation">Settle</button>
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke stage-bar control */}
        <button className="orr-btn" onClick={onFit}>Fit</button>
      </div>
    </div>
  );
}
