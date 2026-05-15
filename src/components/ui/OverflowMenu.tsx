import { useState, useRef, useEffect } from 'react';

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export interface OverflowMenuSep {
  sep: true;
}

export type OverflowMenuEntry = OverflowMenuItem | OverflowMenuSep;

export function OverflowMenu({ items }: { items: OverflowMenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="as-ov">
      <button className="as-ov-btn" onClick={() => setOpen(o => !o)} title="More actions">
        ···
      </button>
      {open && (
        <div className="as-ov-menu">
          {items.map((item, i) => {
            if ('sep' in item) return <div key={i} className="as-ov-sep" />;
            return (
              <button
                key={i}
                className={`as-ov-item${item.danger ? ' is-danger' : ''}`}
                onClick={() => { setOpen(false); item.onClick(); }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
