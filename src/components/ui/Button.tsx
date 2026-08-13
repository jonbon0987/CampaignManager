import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Audit F4 — additions are backwards-compatible:
//   • new `xs` size absorbs the dense toolbar/pill buttons (py-0.5 controls)
//   • new `link` variant absorbs the inline text buttons (auth "Forgot password?",
//     NPC "In Campaign ✓", etc.) that were hand-styled with an underline linkStyle
// Existing call sites keep working unchanged.
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, { base: string; hover: string }> = {
  primary:   { base: 'bg-gold text-bg border-gold',                 hover: 'hover:bg-gold-hover hover:border-gold-hover' },
  secondary: { base: 'bg-transparent text-muted border-border',     hover: 'hover:text-parchment hover:border-border-hover' },
  danger:    { base: 'bg-transparent border-border',                hover: 'hover:border-red' },
  ghost:     { base: 'bg-transparent border-transparent text-muted',hover: 'hover:text-parchment hover:bg-surface-high' },
  link:      { base: 'bg-transparent border-transparent text-gold underline underline-offset-2', hover: 'hover:text-gold-2' },
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2 py-0.5 text-[11px]',
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
  // `link` is inline text — no box padding, no rounded border.
  const sizeClass = variant === 'link' ? 'p-0 text-xs' : sizeStyles[size];

  return (
    <button
      {...props}
      className={`
        inline-flex items-center justify-center gap-1.5
        ${variant === 'link' ? '' : 'rounded border'} font-medium
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
