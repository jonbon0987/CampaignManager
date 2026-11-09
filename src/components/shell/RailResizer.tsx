// The grip on the docked rail's left edge: drag it, or focus it and use the
// arrow keys, to make the assistant (or a stat sheet, or the table tools)
// wider or narrower. Double-click puts it back. The shell keeps the width.

import { useRef, useState } from 'react';
import { RAIL_DEFAULT, RAIL_MIN, railMax, clampRail } from './railWidth';

const STEP = 16;

export function RailResizer({ width, onResize }: {
  width: number;
  /** `done` is false while dragging and true once the width is settled, which is when it's kept. */
  onResize: (width: number, done: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);
  const max = railMax(window.innerWidth);

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const next = clampRail(start.current.width + (start.current.x - e.clientX), window.innerWidth);
    start.current = null;
    setDragging(false);
    document.body.classList.remove('is-resizing-rail');
    onResize(next, true);
  };

  return (
    <div
      className={`cm-rail-resize${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Side panel width"
      aria-valuemin={RAIL_MIN}
      aria-valuemax={max}
      aria-valuenow={Math.min(width, max)}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        setDragging(true);
        document.body.classList.add('is-resizing-rail');
      }}
      onPointerMove={e => {
        if (!start.current) return;
        // The rail sits on the right, so moving left makes it wider.
        onResize(clampRail(start.current.width + (start.current.x - e.clientX), window.innerWidth), false);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onResize(RAIL_DEFAULT, true)}
      onKeyDown={e => {
        const to = e.key === 'ArrowLeft' ? width + STEP : e.key === 'ArrowRight' ? width - STEP
          : e.key === 'Home' ? RAIL_MIN : e.key === 'End' ? max : null;
        if (to === null) return;
        e.preventDefault();
        onResize(clampRail(to, window.innerWidth), true);
      }}
    />
  );
}
