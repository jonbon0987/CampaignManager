import { useState, useRef, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from './Button';

type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'date';

interface SelectOption {
  value: string;
  label: string;
}

interface InlineEditFieldProps {
  value: string | null;
  onSave: (value: string) => void | Promise<void>;
  type?: FieldType;
  label?: string;
  placeholder?: string;
  options?: SelectOption[];
  disabled?: boolean;
  saving?: boolean;
  rows?: number;
  className?: string;
}

export function InlineEditField({
  value,
  onSave,
  type = 'text',
  label,
  placeholder,
  options,
  disabled,
  saving,
  rows = 3,
  className = '',
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type !== 'select' && 'setSelectionRange' in inputRef.current) {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, [editing, type]);

  const enterEdit = () => {
    if (disabled) return;
    setLocalValue(value ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setLocalValue(value ?? '');
  };

  const save = async () => {
    await onSave(localValue);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancel();
    } else if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      save();
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1a1828',
    color: '#e8d5b0',
    border: '1px solid #3a3660',
    fontFamily: 'Georgia, Cambria, serif',
    fontSize: '0.875rem',
    borderRadius: '0.375rem',
    padding: '0.375rem 0.5rem',
    width: '100%',
  };

  if (editing) {
    return (
      <div className={className}>
        {label && (
          <div
            className="mb-1"
            style={{
              color: '#c9a84c',
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {label}
          </div>
        )}
        {type === 'textarea' ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={rows}
            placeholder={placeholder}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
          />
        ) : type === 'select' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={inputStyle}
          />
        )}
        <div className="flex gap-2 mt-1.5">
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? '…' : 'Save'}
          </Button>
          <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // View mode
  const displayValue = value || placeholder;
  const isEmpty = !value;

  return (
    <div
      className={`group relative cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-surface-high ${className}`}
      onClick={enterEdit}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => { if (e.key === 'Enter') enterEdit(); }}
    >
      {label && (
        <div
          className="mb-0.5"
          style={{
            color: '#c9a84c',
            fontSize: '0.65rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </div>
      )}
      <span
        className="text-sm"
        style={{
          color: isEmpty ? '#6a6490' : '#e8d5b0',
          fontStyle: isEmpty ? 'italic' : 'normal',
          whiteSpace: type === 'textarea' ? 'pre-wrap' : 'normal',
        }}
      >
        {displayValue || 'Click to edit'}
      </span>
      {!disabled && (
        <Pencil
          size={12}
          strokeWidth={1.5}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#6a6490' }}
        />
      )}
    </div>
  );
}
