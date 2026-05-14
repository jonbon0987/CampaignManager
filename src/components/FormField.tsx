import type { ReactNode, CSSProperties } from 'react';

interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: string;
}

export function FormField({ label, children, className = '', hint }: FormFieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="cm-label">
        {label}
      </label>
      {hint && (
        <p className="text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>{hint}</p>
      )}
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  backgroundColor: 'var(--paper-2)',
  color: 'var(--ink)',
  border: '1px solid var(--rule)',
  borderRadius: '6px',
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
