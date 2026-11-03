import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';

// The big title at the top of a detail page (`.as-title`). It's a one-line
// field that wraps: a textarea that grows with its text, so a long name shows
// in full instead of being cut off at the edge. Enter doesn't add a line, and
// pasted line breaks become spaces, so the value stays a single line.
type TitleInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'rows'> & { value: string };

export const TitleInput = forwardRef<HTMLTextAreaElement, TitleInputProps>(function TitleInput(
  { className = 'as-title', onChange, onKeyDown, value, ...props }, ref,
) {
  const el = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLTextAreaElement);

  const fit = () => {
    const t = el.current;
    if (!t) return;
    t.style.height = 'auto';
    if (t.scrollHeight > 0) t.style.height = `${t.scrollHeight}px`;
  };

  useLayoutEffect(fit, [value]);

  // A narrower pane (the rail opening, a resize) rewraps the text.
  useLayoutEffect(() => {
    const t = el.current;
    if (!t || typeof ResizeObserver === 'undefined') return;
    let width = t.clientWidth;
    const ro = new ResizeObserver(() => {
      if (t.clientWidth === width) return;
      width = t.clientWidth;
      fit();
    });
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  const change = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
    onChange?.(e);
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
    onKeyDown?.(e);
  };

  return <textarea {...props} ref={el} rows={1} className={className} value={value} onChange={change} onKeyDown={keyDown} />;
});
