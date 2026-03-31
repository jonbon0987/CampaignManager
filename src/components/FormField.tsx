import { ReactNode, CSSProperties } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, children, className = '' }: FormFieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  backgroundColor: '#22203a',
  color: '#e8d5b0',
  border: '1px solid #3a3660',
  borderRadius: '4px',
  outline: 'none',
  fontFamily: 'Georgia, Cambria, serif',
  fontSize: '14px',
  width: '100%',
  padding: '8px 10px',
  boxSizing: 'border-box',
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '80px',
  lineHeight: '1.6',
};
