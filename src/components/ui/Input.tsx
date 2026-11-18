import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useFieldId } from './fieldContext';

// The text fields, as siblings of <Button>. Two looks:
//   form   — dialogs and forms: paper background, 8×12 padding (.cm-input / .cm-select / .cm-textarea)
//   inline — the detail editors: page background, softer border (.as-input / .as-select)
// For text-like controls only; checkboxes, radios, ranges and file inputs stay raw.
// Inside a <FormField>, the control takes the field's id so its label points at it.

export type FieldLook = 'form' | 'inline';

const cls = (base: string, className?: string) => (className ? `${base} ${className}` : base);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { look?: FieldLook }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ look = 'form', className, id, ...props }, ref) {
  const fieldId = useFieldId();
  return <input ref={ref} id={id ?? fieldId} {...props} className={cls(look === 'form' ? 'cm-input' : 'as-input', className)} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { look?: FieldLook }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ look = 'form', className, id, ...props }, ref) {
  const fieldId = useFieldId();
  return <select ref={ref} id={id ?? fieldId} {...props} className={cls(look === 'form' ? 'cm-select' : 'as-select', className)} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { look?: FieldLook }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ look = 'form', className, id, ...props }, ref) {
  const fieldId = useFieldId();
  return <textarea ref={ref} id={id ?? fieldId} {...props} className={cls(look === 'form' ? 'cm-textarea' : 'as-input', className)} />;
});
