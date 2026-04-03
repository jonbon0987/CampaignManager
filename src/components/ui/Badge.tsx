type BadgeColor = 'gold' | 'green' | 'red' | 'blue' | 'muted' | 'yellow' | 'orange';
type BadgeSize = 'xs' | 'sm';

interface BadgeProps {
  label: string;
  color?: BadgeColor;
  size?: BadgeSize;
}

const colorMap: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  gold:   { bg: '#2a2418', text: '#c9a84c', border: '#5a4a20' },
  green:  { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  red:    { bg: '#3a1a1a', text: '#e05c5c', border: '#6a2a2a' },
  blue:   { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  muted:  { bg: '#1a1828', text: '#9990b0', border: '#3a3660' },
  yellow: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  orange: { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
};

const sizeMap: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
};

export function Badge({ label, color = 'muted', size = 'xs' }: BadgeProps) {
  const c = colorMap[color];
  return (
    <span
      className={`inline-block rounded font-medium leading-tight ${sizeMap[size]}`}
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  );
}
