import { useId, type ReactNode } from 'react';
import { FieldIdContext } from './ui/fieldContext';

interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: string;
  /** The control's id. Only needed when the child is not an <Input>/<Select>/<Textarea>
   *  (those take the field's id themselves) or sets its own id. */
  htmlFor?: string;
}

export function FormField({ label, children, className = '', hint, htmlFor }: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <div className={`mb-4 ${className}`}>
      <label className="cm-label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>{hint}</p>
      )}
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
    </div>
  );
}
