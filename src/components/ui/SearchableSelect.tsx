import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

interface Option {
  id: string;
  label: string;
  detail?: string;
}

interface SearchableSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  options: Option[];
  placeholder?: string;
  allowClear?: boolean;
  searchPlaceholder?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  allowClear = true,
  searchPlaceholder = 'Search...',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.detail && o.detail.toLowerCase().includes(q))
    );
  }, [options, search]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-option]');
    const item = items[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlightIndex];
      if (item) {
        onChange(item.id);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          backgroundColor: 'var(--paper-2)',
          color: selected ? 'var(--ink)' : 'var(--ink-3)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--serif)',
          fontSize: 14,
          padding: '8px 10px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          {allowClear && value && (
            <span
              onClick={e => { e.stopPropagation(); onChange(null); }}
              style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-2)' }}
              title="Clear"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: 'var(--ink-2)' }} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius)',
            zIndex: 60,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--rule-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: 'var(--ink)',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--serif)',
                  fontSize: 13,
                  padding: '4px 0',
                }}
              />
            </div>
          </div>

          {/* Options list */}
          <div
            ref={listRef}
            style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}
          >
            {allowClear && (
              <button
                type="button"
                data-option
                onClick={() => { onChange(null); setOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-3)',
                  fontStyle: 'italic',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--serif)',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--paper-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                None
              </button>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: '8px', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
                No matches
              </div>
            )}
            {filtered.map((opt, i) => {
              const adjustedIndex = allowClear ? i + 1 : i;
              const isHighlighted = adjustedIndex === highlightIndex || (!allowClear && i === highlightIndex);
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-option
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: isHighlighted ? 'var(--paper-2)' : 'none',
                    border: 'none',
                    color: opt.id === value ? 'var(--gold)' : 'var(--ink)',
                    textAlign: 'left',
                    padding: '6px 8px',
                    fontSize: 13,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--serif)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--paper-2)'; setHighlightIndex(i); }}
                  onMouseLeave={e => { if (!isHighlighted) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div>{opt.label}</div>
                  {opt.detail && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{opt.detail}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
