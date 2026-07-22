import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface AddOption {
  label: string;
  onClick: () => void;
}

interface ListDetailProps {
  title: string;
  count: number;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  /** When set, renders a dropdown of add actions instead of a single onAdd button. */
  addOptions?: AddOption[];
  onImport?: () => void;
  importLabel?: string;
  onGenerate?: () => void;
  generateLabel?: string;
  filters?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}

function AddMenu({ label, options }: { label: string; options: AddOption[] }) {
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
      <button className="cm-md-add" onClick={() => setOpen(o => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="as-ov-menu">
          {options.map((opt, i) => (
            <button
              key={i}
              className="as-ov-item"
              onClick={() => { setOpen(false); opt.onClick(); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Master-detail shell: scrollable list rail on the left, detail panel on the right.
 * Uses the .cm-md CSS grid from the Scriptorium design system.
 */
export function ListDetail({
  title,
  count,
  search,
  onSearchChange,
  onAdd,
  addLabel = '+ New',
  addOptions,
  onImport,
  importLabel = '⊕ Import',
  onGenerate,
  generateLabel = '✦ Generate',
  filters,
  list,
  detail,
}: ListDetailProps) {
  return (
    <div className="cm-md">
      <div className="cm-md-list">
        <div className="cm-md-list-head">
          <div>
            <div className="cm-md-eyebrow">
              {count} {count === 1 ? 'entry' : 'entries'}
            </div>
            <h2 className="cm-md-title">{title}</h2>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {onGenerate && (
              <button className="cm-md-add cm-md-generate" onClick={onGenerate}>
                {generateLabel}
              </button>
            )}
            {onImport && (
              <button className="cm-md-add cm-md-import" onClick={onImport}>
                {importLabel}
              </button>
            )}
            {addOptions ? (
              <AddMenu label={addLabel} options={addOptions} />
            ) : onAdd ? (
              <button className="cm-md-add" onClick={onAdd}>
                {addLabel}
              </button>
            ) : null}
          </div>
        </div>
        <div className="cm-md-search">
          <span className="cm-md-search-glyph">&#x2315;</span>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search…"
          />
        </div>
        {filters && <div className="cm-md-filters">{filters}</div>}
        <div className="cm-md-list-scroll">{list}</div>
      </div>
      <div className="cm-md-detail">{detail}</div>
    </div>
  );
}

interface ListRowProps {
  active?: boolean;
  onClick?: () => void;
  glyph?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  badges?: ReactNode;
}

export function ListRow({
  active = false,
  onClick,
  glyph,
  title,
  subtitle,
  meta,
  badges,
}: ListRowProps) {
  return (
    <button
      className={`cm-row ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {glyph && <span className="cm-row-glyph">{glyph}</span>}
      <span className="cm-row-body">
        <span className="cm-row-title">{title}</span>
        {subtitle && <span className="cm-row-sub">{subtitle}</span>}
        {badges && <span className="cm-row-badges">{badges}</span>}
      </span>
      {meta && <span className="cm-row-meta">{meta}</span>}
    </button>
  );
}

interface DetailPanelProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function DetailPanel({ eyebrow, title, subtitle, children }: DetailPanelProps) {
  return (
    <div className="cm-detail">
      <div className="cm-detail-head">
        {eyebrow && <div className="cm-detail-eyebrow">{eyebrow}</div>}
        <h1 className="cm-detail-title">{title}</h1>
        {subtitle && <div className="cm-detail-sub">{subtitle}</div>}
      </div>
      <div className="cm-detail-body">{children}</div>
    </div>
  );
}

interface DetailSectionProps {
  title: string;
  children: ReactNode;
}

export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="cm-section">
      <div className="cm-section-head">
        <span className="cm-section-rule" />
        <span className="cm-section-title">{title}</span>
        <span className="cm-section-rule" />
      </div>
      {children}
    </section>
  );
}

interface PillProps {
  active?: boolean;
  subtle?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Pill({ active = false, subtle = false, onClick, children }: PillProps) {
  return (
    <button
      className={`cm-pill ${active ? 'is-active' : ''} ${subtle ? 'is-subtle' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function FilterSep() {
  return <span className="cm-filter-sep" />;
}

interface EmptyDetailProps {
  children: ReactNode;
}

export function EmptyDetail({ children }: EmptyDetailProps) {
  return <div className="cm-empty">{children}</div>;
}
