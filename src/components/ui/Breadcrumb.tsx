import { ChevronRight } from 'lucide-react';

export interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Breadcrumb">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={12} strokeWidth={1.5} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            )}
            {isLast || !seg.onClick ? (
              <span
                style={{
                  color: isLast ? 'var(--gold)' : 'var(--ink-3)',
                  fontFamily: 'var(--display)',
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {seg.label}
              </span>
            ) : (
              <button
                onClick={seg.onClick}
                style={{
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--display)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
