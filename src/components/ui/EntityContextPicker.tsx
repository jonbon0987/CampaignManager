// Grouped, searchable multi-select for feeding specific campaign entities into
// an AI generator prompt. Reads the shared EntityRefContext index (every NPC,
// thread, location, faction, lore entry, PC, session, module, and stat sheet),
// so it stays in sync with the app's @-mention system. Selection is transient —
// the parent turns the chosen {kind,id} refs into prompt context at generate
// time; nothing is persisted.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEntityRefs } from '../../context/EntityRefContext';
import { KINDS, KIND_GLYPH, KIND_GROUP_LABEL, type RefKind } from '../../lib/slashMarkdown';
import type { SelectedEntity } from '../../lib/campaignContext';

export interface ContextRef {
  kind: RefKind;
  id: string;
}

const keyOf = (r: ContextRef) => `${r.kind}:${r.id}`;

// Resolve picked {kind,id} refs into the rich shape buildSelectedContextBlock
// wants, pulling label / subtitle / description / meta from the shared index.
export function useSelectedContextEntities(selected: ContextRef[]): SelectedEntity[] {
  const { refById, detailFor } = useEntityRefs();
  return useMemo(() => selected.map(r => {
    const ref = refById(r.kind, r.id);
    const d = detailFor(r.kind, r.id);
    // detailFor substitutes a "No description yet." placeholder — drop it so it
    // never leaks into the prompt as if it were real description text.
    const desc = d.desc === 'No description yet.' ? '' : d.desc;
    return {
      kind: r.kind,
      id: r.id,
      label: d.label || ref?.label || r.id,
      sub: d.sub || ref?.sub || '',
      desc,
      meta: d.meta,
    } satisfies SelectedEntity;
  }), [selected, refById, detailFor]);
}

export function EntityContextPicker({
  selected,
  onChange,
  disabled = false,
  label = 'Campaign Context',
}: {
  selected: ContextRef[];
  onChange: (next: ContextRef[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { entities, refById } = useEntityRefs();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the results dropdown when clicking anywhere outside the picker.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedKeys = useMemo(() => new Set(selected.map(keyOf)), [selected]);

  // Available (not-yet-selected) entities, filtered by query and grouped by kind.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const buckets = new Map<RefKind, typeof entities>();
    for (const e of entities) {
      if (selectedKeys.has(`${e.kind}:${e.id}`)) continue;
      if (q && !e.label.toLowerCase().includes(q) && !(e.sub ?? '').toLowerCase().includes(q)) continue;
      const bucket = buckets.get(e.kind) ?? [];
      bucket.push(e);
      buckets.set(e.kind, bucket);
    }
    return KINDS
      .map(kind => ({ kind, items: buckets.get(kind) ?? [] }))
      .filter(g => g.items.length > 0);
  }, [entities, query, selectedKeys]);

  const add = (r: ContextRef) => {
    if (disabled || selectedKeys.has(keyOf(r))) return;
    onChange([...selected, r]);
    setQuery('');
  };
  const remove = (r: ContextRef) => {
    if (disabled) return;
    onChange(selected.filter(s => keyOf(s) !== keyOf(r)));
  };

  const totalAvailable = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div ref={rootRef}>
      <div style={{ color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px' }}>
        {label} {selected.length > 0 && `(${selected.length})`}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(r => {
            const ref = refById(r.kind, r.id);
            return (
              <span
                key={keyOf(r)}
                className="inline-flex items-center gap-1 text-xs rounded px-2 py-1"
                style={{
                  backgroundColor: 'var(--gold-dim)',
                  color: 'var(--gold)',
                  border: '1px solid var(--gold-line)',
                }}
              >
                <span aria-hidden>{KIND_GLYPH[r.kind]}</span>
                <span>{ref?.label ?? r.id}</span>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  disabled={disabled}
                  aria-label={`Remove ${ref?.label ?? 'entity'} from context`}
                  className="ml-0.5 leading-none"
                  style={{ color: 'var(--gold)', cursor: disabled ? 'not-allowed' : 'pointer' }}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search / add */}
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
        disabled={disabled}
        placeholder="Search NPCs, locations, lore… to add context"
        className="w-full text-sm rounded px-2.5 py-1.5"
        style={{
          backgroundColor: 'var(--paper)',
          color: 'var(--ink-1)',
          border: '1px solid var(--rule)',
        }}
      />

      {open && !disabled && (
        <div
          className="mt-1.5 rounded overflow-y-auto"
          style={{ border: '1px solid var(--rule)', maxHeight: '220px', backgroundColor: 'var(--paper)' }}
        >
          {totalAvailable === 0 ? (
            <p className="text-xs px-2.5 py-2" style={{ color: 'var(--ink-3)' }}>
              {query.trim() ? 'No matching entities.' : 'Nothing left to add.'}
            </p>
          ) : (
            groups.map(g => (
              <div key={g.kind}>
                <div
                  className="text-xs font-semibold px-2.5 py-1 sticky top-0"
                  style={{ color: 'var(--ink-3)', backgroundColor: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}
                >
                  {KIND_GROUP_LABEL[g.kind]}
                </div>
                {g.items.map(e => (
                  <button
                    key={`${e.kind}:${e.id}`}
                    type="button"
                    onClick={() => add({ kind: e.kind, id: e.id })}
                    className="w-full flex items-center gap-2 text-left text-sm px-2.5 py-1.5 transition-colors"
                    style={{ color: 'var(--ink-2)' }}
                    onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = 'var(--gold-dim)')}
                    onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span aria-hidden style={{ color: 'var(--gold)' }}>{KIND_GLYPH[e.kind]}</span>
                    <span className="truncate">{e.label}</span>
                    {e.sub && (
                      <span className="text-xs truncate ml-auto" style={{ color: 'var(--ink-3)' }}>{e.sub}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
