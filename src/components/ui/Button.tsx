import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, { base: string; hover: string }> = {
  primary:   { base: 'bg-gold text-bg border-gold',                hover: 'hover:bg-gold-hover hover:border-gold-hover' },
  secondary: { base: 'bg-transparent text-muted border-border',    hover: 'hover:text-parchment hover:border-border-hover' },
  danger:    { base: 'bg-transparent border-border',               hover: 'hover:border-red' },
  ghost:     { base: 'bg-transparent border-transparent text-muted', hover: 'hover:text-parchment hover:bg-surface-high' },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  style,
  ...props
}: ButtonProps) {
  const { base, hover } = variantStyles[variant];
  const sizeClass = sizeStyles[size];

  return (
    <button
      {...props}
      className={`
        inline-flex items-center justify-center gap-1.5
        rounded border font-medium
        transition-colors duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${base} ${hover} ${sizeClass} ${className}
      `.trim().replace(/\s+/g, ' ')}
      style={{
        fontFamily: 'var(--serif)',
        ...(variant === 'danger' ? { color: 'var(--red)' } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
