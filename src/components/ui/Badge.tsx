import type { ReactNode } from 'react';

type BadgeColor = 'gold' | 'green' | 'red' | 'blue' | 'muted' | 'yellow' | 'orange';
type BadgeSize = 'xs' | 'sm';

interface BadgeProps {
  label?: string;
  color?: BadgeColor;
  size?: BadgeSize;
  children?: ReactNode;
}

const colorMap: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  gold:   { bg: 'var(--pill-bg)',     text: 'var(--gold)',    border: 'var(--pill-bd)' },
  green:  { bg: 'var(--success-bg)',  text: 'var(--success)', border: 'var(--success-line)' },
  red:    { bg: 'var(--red-bg)',      text: 'var(--red)',     border: 'var(--red-line)' },
  blue:   { bg: 'var(--info-bg)',     text: 'var(--info)',    border: 'var(--info-line)' },
  muted:  { bg: 'var(--paper-2)',     text: 'var(--ink-3)',   border: 'var(--rule)' },
  yellow: { bg: 'var(--warn-bg)',     text: 'var(--warn)',    border: 'var(--warn-line)' },
  orange: { bg: 'var(--orange-bg)',   text: 'var(--orange)',  border: 'var(--orange-line)' },
};

const sizeMap: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
};

export function Badge({ label, color = 'muted', size = 'xs', children }: BadgeProps) {
  const c = colorMap[color];
  return (
    <span
      className={`inline-block rounded font-medium leading-tight ${sizeMap[size]}`}
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {label ?? children}
    </span>
  );
}
