import type { CSSProperties } from 'react';
import { useEntityRefs } from '../../context/EntityRefContext';
import { parseSegments, hasRefs, refRegex, KIND_GLYPH, KIND_LABEL } from '../../lib/slashMarkdown';
import type { RefKind } from '../../lib/slashMarkdown';

/** Reference kinds. `creature` is accepted on read as a legacy alias for `statblock`. */
type EntityType = RefKind;

interface EntityChipProps {
  entityType: EntityType;
  id: string;
  displayName: string;
  /** Show an × button to remove this chip */
  onRemove?: () => void;
}

/**
 * Inline reference pill. Resolves its label/glyph and click target through
 * EntityRefContext so it works in BOTH world and campaign modes.
 */
function EntityChip({ entityType, id, displayName, onRemove }: EntityChipProps) {
  const { refById, openRef } = useEntityRefs();

  const found = refById(entityType, id);
  const missing = !found;
  const label = found?.label || displayName || 'Unknown';
  const glyph = KIND_GLYPH[entityType] || '·';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!missing) openRef(entityType, id);
  };

  return (
    <span className={`rre-pill${missing ? ' is-missing' : ''}`} contentEditable={false}>
      <button
        type="button"
        onClick={handleClick}
        title={missing ? `${KIND_LABEL[entityType] ?? entityType} not found` : `${KIND_LABEL[entityType] ?? entityType}: ${label}`}
        style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <span className="rre-pill-glyph">{missing ? '⚠' : glyph}</span>
        <span className="rre-pill-label">{label}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove link"
          className="rre-pill-x"
          style={{ background: 'none', border: 'none', padding: '0 0 0 2px', color: 'inherit', cursor: 'pointer', fontSize: '0.85em', lineHeight: 1, opacity: 0.6 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          ×
        </button>
      )}
    </span>
  );
}

interface StatBlockTextProps {
  text: string | null | undefined;
  as?: 'pre' | 'p' | 'div';
  style?: CSSProperties;
  className?: string;
}

export function StatBlockText({ text, as: Tag = 'p', style, className }: StatBlockTextProps) {
  if (!text) return null;

  // Fast path: no entity links — render the plain element.
  if (!hasRefs(text)) {
    return <Tag style={style} className={className}>{text}</Tag>;
  }

  const segments = parseSegments(text);
  return (
    <Tag style={style} className={className}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <EntityChip key={i} entityType={seg.entityType} id={seg.id} displayName={seg.displayName} />
        ),
      )}
    </Tag>
  );
}

// Re-exports for existing consumers (MarkdownContent, MarkdownEditor, toolbars).
export { EntityChip, parseSegments, refRegex };
export type { EntityType };
