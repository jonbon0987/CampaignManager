import { useId, type MouseEvent, type ReactNode } from 'react';
import { FieldIdContext } from './ui/fieldContext';

interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: string;
  /** The control's id. Only needed when the child is not an <Input>/<Select>/<Textarea>/<SlashField>
   *  (those take the field's id themselves) or sets its own id. */
  htmlFor?: string;
}

export function FormField({ label, children, className = '', hint, htmlFor }: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  // A <label for> can't focus a contentEditable editor (SlashField), so the
  // click does it; the editor names itself with aria-labelledby.
  const focusEditor = (e: MouseEvent<HTMLLabelElement>) => {
    const el = document.getElementById(id);
    if (el?.getAttribute('contenteditable') === 'true') { e.preventDefault(); el.focus(); }
  };
  return (
    <div className={`mb-4 ${className}`}>
      <label className="cm-label" htmlFor={id} id={`${id}-label`} onClick={focusEditor}>
        {label}
      </label>
      {hint && (
        <p className="text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>{hint}</p>
      )}
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
    </div>
  );
}
