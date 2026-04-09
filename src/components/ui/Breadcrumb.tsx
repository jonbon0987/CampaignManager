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
              <ChevronRight size={12} strokeWidth={1.5} style={{ color: '#4a4470', flexShrink: 0 }} />
            )}
            {isLast || !seg.onClick ? (
              <span
                style={{
                  color: isLast ? '#c9a84c' : '#6a6490',
                  fontFamily: 'Georgia, Cambria, serif',
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {seg.label}
              </span>
            ) : (
              <button
                onClick={seg.onClick}
                style={{
                  color: '#6a6490',
                  fontFamily: 'Georgia, Cambria, serif',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
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
