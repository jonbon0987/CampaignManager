import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Audit F4 — the labeled topbar pill buttons: a gold glyph + optional text label
// + optional ⌘-key hint (was `.cm-top-btn`, duplicated across Topbar/WorldTopbar).
// These carry text and a <kbd>, so `IconButton` (a fixed 30×30 square) can't hold
// them — they get their own primitive. Owning `.cm-top-btn` here keeps the render
// identical while routing every call site through a component, so features stop
// minting raw styled <button>s (the F10 root cause).
//
// Pass `active` for the toggled/on state (e.g. scratchpad open).
interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  glyph?: ReactNode;
  kbd?: ReactNode;
  active?: boolean;
  children?: ReactNode;
}

export function ToolbarButton({ glyph, kbd, active = false, children, className = '', ...props }: ToolbarButtonProps) {
  return (
    <button
      {...props}
      className={`cm-top-btn${active ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
    >
      {glyph != null && <span className="cm-top-btn-glyph">{glyph}</span>}
      {children}
      {kbd != null && <kbd>{kbd}</kbd>}
    </button>
  );
}
