import { useEffect, useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
  minRows?: number;
  autoFocus?: boolean;
}

/**
 * A textarea that grows vertically with its content instead of scrolling.
 * Avoids the cramped fixed-height box problem for long-form prose fields.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  style,
  className = '',
  disabled,
  minRows = 3,
  autoFocus,
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      rows={minRows}
      className={`w-full outline-none ${className}`}
      style={{
        resize: 'none',
        overflow: 'hidden',
        lineHeight: '1.65',
        ...style,
      }}
    />
  );
}
