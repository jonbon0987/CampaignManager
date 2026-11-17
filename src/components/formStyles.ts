import type { CSSProperties } from 'react';

// The inline input and textarea look shared by the older forms and the AI
// generator dialogs. Phase 7 of the v5 audit replaces these with the
// Input / Textarea primitives; until then they live here, not in FormField.tsx,
// so that file exports only a component (React Fast Refresh needs that).

export const inputStyle: CSSProperties = {
  backgroundColor: 'var(--paper-2)',
  color: 'var(--ink)',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius)',
  outline: 'none',
  fontFamily: 'var(--serif)',
  fontSize: '14px',
  width: '100%',
  padding: '8px 12px',
  boxSizing: 'border-box',
  colorScheme: 'dark',
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '80px',
  lineHeight: '1.6',
  fontSize: '15px',
};
