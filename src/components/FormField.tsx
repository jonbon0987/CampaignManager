import type { ReactNode } from 'react';

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
