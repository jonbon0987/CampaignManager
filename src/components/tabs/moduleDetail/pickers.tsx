/* ════════════════════════════════════════════════════════════════
   moduleDetail/pickers.tsx
   Inline popover pickers that replace the old modal dialogs
   (stat-sheet link, encounter link, dependency add, type select).
   Everything edits in place. Their helpers live in lib/moduleStructure.
   ════════════════════════════════════════════════════════════════ */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { getModuleTypeInfo } from '../../../lib/theme';
import { SUBMODULE_TYPES } from '../../../lib/moduleStructure';
import { Button } from '../../ui/Button';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { onActivate } from '../../../lib/activate';
import { useEscape } from '../../../hooks/useEscape';

/* ── close on an outside click or Escape ── */
function useClickAway<T extends HTMLElement>(active: boolean, onAway: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onAway(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, onAway]);
  useEscape(active, onAway);
  return ref;
}

/* ── Type tag: static or clickable picker ── */
export function TypeTag({ type, types, onPick }: {
  type: string | null;
  types?: string[];
  onPick?: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = getModuleTypeInfo(type);
  const ref = useClickAway<HTMLSpanElement>(open, () => setOpen(false));

  if (!onPick) {
    return (
      <span className="md-tag md-tag-static" style={{ color: info.color }}>
        <span className="md-tag-glyph">{info.glyph}</span>{info.label}
      </span>
    );
  }
  return (
    <span className="md-pop-wrap" ref={ref}>
      <span className="md-tag" style={{ color: info.color }} role="button" tabIndex={0} aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(o => !o)} onKeyDown={onActivate(() => setOpen(o => !o))}>
        <span className="md-tag-glyph">{info.glyph}</span>{info.label}
      </span>
      {open && (
        <div className="md-pop" style={{ minWidth: 180 }}>
          {(types ?? SUBMODULE_TYPES).map(t => {
            const ti = getModuleTypeInfo(t);
            return (
              <button key={t}
                // eslint-disable-next-line no-restricted-syntax -- option in an inline popover
                className="md-pop-item" onClick={() => { onPick(t); setOpen(false); }}>
                <span style={{ color: ti.color }}>{ti.glyph}</span>{ti.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

/* ── Generic inline picker popover (anchor button + option list) ── */
export interface PickerOption { id: string; label: string; meta?: string; glyph?: string; color?: string; }

export function InlinePicker({ label, options, onPick, header, radio }: {
  label: string;
  options: PickerOption[];
  onPick: (id: string) => void;
  header?: ReactNode;
  radio?: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(open, () => setOpen(false));
  return (
    <span className="md-pop-wrap" ref={ref}>
      <Button variant="secondary" size="xs" onClick={() => setOpen(o => !o)}>＋ {label}</Button>
      {open && (
        <div className="md-pop">
          {header && <div className="md-pop-empty" style={{ fontStyle: 'normal', color: 'var(--ink-2)' }}>{header}</div>}
          {radio && (
            <SegmentedControl className="md-pop-radio" aria-label={radio.label} value={radio.value}
              options={radio.options} onChange={radio.onChange} />
          )}
          {options.length === 0
            ? <div className="md-pop-empty">Nothing available to add.</div>
            : options.map(o => (
              <button key={o.id}
                // eslint-disable-next-line no-restricted-syntax -- option in an inline popover
                className="md-pop-item" onClick={() => { onPick(o.id); setOpen(false); }}>
                {o.glyph && <span style={{ color: o.color ?? 'var(--gold)' }}>{o.glyph}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {o.meta && <span className="md-pop-item-meta">{o.meta}</span>}
              </button>
            ))}
        </div>
      )}
    </span>
  );
}
