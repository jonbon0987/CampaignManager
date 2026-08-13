/* ════════════════════════════════════════════════════════════════
   moduleDetail/pickers.tsx
   Shared helpers + inline popover pickers that replace the old
   modal dialogs (stat-sheet link, encounter link, dependency add,
   type select). Everything edits in place.
   ════════════════════════════════════════════════════════════════ */
import { useState, useRef, useEffect, type ReactNode } from 'react';

/* Type metadata now lives in src/lib/theme.ts (audit F9) — re-export to keep this module's API. */
import { moduleTypeMeta as TYPE_META, type TypeInfo } from '../../../lib/theme';
export { TYPE_META };
export type { TypeInfo };

export const SUBMODULE_TYPES = ['location', 'encounter', 'social', 'heist', 'event', 'travel', 'exploration', 'other'];
export const SCENE_TYPES = ['encounter', 'puzzle', 'social', 'trap', 'exploration', 'event', 'other'];

export const typeInfo = (t: string | null | undefined): TypeInfo => TYPE_META[t ?? 'other'] ?? TYPE_META.other;

export function parseLinkedIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

/* ── close-on-outside-click hook ── */
function useClickAway<T extends HTMLElement>(active: boolean, onAway: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onAway(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [active, onAway]);
  return ref;
}

/* ── Type tag: static or clickable picker ── */
export function TypeTag({ type, types, onPick }: {
  type: string | null;
  types?: string[];
  onPick?: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = typeInfo(type);
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
      <span className="md-tag" style={{ color: info.color }} onClick={() => setOpen(o => !o)}>
        <span className="md-tag-glyph">{info.glyph}</span>{info.label}
      </span>
      {open && (
        <div className="md-pop" style={{ minWidth: 180 }}>
          {(types ?? SUBMODULE_TYPES).map(t => {
            const ti = typeInfo(t);
            return (
              <button key={t} className="md-pop-item" onClick={() => { onPick(t); setOpen(false); }}>
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
  radio?: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(open, () => setOpen(false));
  return (
    <span className="md-pop-wrap" ref={ref}>
      <button className="md-add" onClick={() => setOpen(o => !o)}>＋ {label}</button>
      {open && (
        <div className="md-pop">
          {header && <div className="md-pop-empty" style={{ fontStyle: 'normal', color: 'var(--ink-2)' }}>{header}</div>}
          {radio && (
            <div className="md-pop-radio">
              {radio.options.map(o => (
                <button key={o.value}
                  className={`as-pill-opt ${radio.value === o.value ? 'is-active' : ''}`}
                  onClick={() => radio.onChange(o.value)}>{o.label}</button>
              ))}
            </div>
          )}
          {options.length === 0
            ? <div className="md-pop-empty">Nothing available to add.</div>
            : options.map(o => (
              <button key={o.id} className="md-pop-item" onClick={() => { onPick(o.id); setOpen(false); }}>
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
