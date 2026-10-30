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

/** `up` opens the menu above its button, for menus near the bottom of the screen. */
export function OverflowMenu({ items, up = false }: { items: OverflowMenuEntry[]; up?: boolean }) {
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
      <button className="as-ov-btn" onClick={() => setOpen(o => !o)} title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={open}>
        ···
      </button>
      {open && (
        <div className={`as-ov-menu${up ? ' is-up' : ''}`} role="menu">
          {items.map((item, i) => {
            if ('sep' in item) return <div key={i} className="as-ov-sep" />;
            return (
              <button
                key={i}
                role="menuitem"
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
