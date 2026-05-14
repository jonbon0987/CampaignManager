import type { ReactNode } from 'react';
import { Button } from './Button';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  addLabel?: string;
  extra?: ReactNode;
}

export function SectionHeader({ title, subtitle, onAdd, addLabel = 'Add', extra }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="min-w-0">
        <h2
          className="text-xl font-bold leading-tight"
          style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
        )}
      </div>
      <div className="flex-1" />
      {extra}
      {onAdd && (
        <Button variant="primary" size="sm" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </div>
  );
}
