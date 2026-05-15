import { useState, useEffect, useRef } from 'react';
import type { SaveStatus } from '../../hooks/useAutoSave';

interface OverflowItem {
  label: string;
  danger?: boolean;
  sep?: boolean;
  onClick?: () => void;
}

function OverflowMenu({ items }: { items: OverflowItem[] }) {
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
    <div className="as-overflow" ref={ref}>
      <button className="as-overflow-btn" onClick={() => setOpen(o => !o)} title="More actions">···</button>
      {open && (
        <div className="as-overflow-menu">
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="as-overflow-sep" />
            ) : (
              <button
                key={i}
                className={`as-overflow-item${it.danger ? ' is-danger' : ''}`}
                onClick={() => { setOpen(false); it.onClick?.(); }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface SaveBarProps {
  status: SaveStatus;
  onDelete: () => void;
  label: string;
}

export function SaveBar({ status, onDelete, label }: SaveBarProps) {
  const statusLabel =
    status === 'saving' ? '● Saving…' :
    status === 'unsaved' ? '○ Unsaved' :
    status === 'error' ? '⚠ Error' :
    '✓ Saved';

  return (
    <div className="as-bar">
      <span className={`as-status is-${status}`}>{statusLabel}</span>
      <div className="as-bar-spacer" />
      <OverflowMenu items={[
        { label: `Delete ${label}`, danger: true, onClick: onDelete },
      ]} />
    </div>
  );
}
