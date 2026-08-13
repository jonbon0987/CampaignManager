import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Audit F4 — one home for the square glyph buttons in the topbars
// (was `.cm-top-btn` in index.css, duplicated across Topbar/WorldTopbar).
// Pass `active` for the toggled/on state (scratchpad, run mode, etc.).
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ children, active = false, className = '', style, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      className={`
        inline-flex items-center justify-center rounded border border-transparent
        transition-colors duration-150
        ${active ? 'text-gold bg-surface-high' : 'text-muted'}
        hover:text-parchment hover:bg-surface-high
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      style={{ width: 30, height: 30, fontFamily: 'var(--serif)', fontSize: 16, lineHeight: 1, ...style }}
    >
      {children}
    </button>
  );
}
