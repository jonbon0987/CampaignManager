import type { KeyboardEvent, ReactNode } from 'react';

// One home for every "pick one of a few" row: statuses, modes, editions, views.
// They were hand-built in about twenty places with four different looks.
//
// Two looks, by job:
//   pills — a choice inside a form or a settings row (the default)
//   tray  — switching what a screen or a dialog shows (List / Web, By CR / By party)
//
// Rendered as a radio group: one Tab stop, the arrow keys move the choice, and
// clicking the chosen option again does nothing. For a single on/off option,
// use <TogglePill> instead.

export type SegmentValue = string | number | boolean;

export interface SegmentOption<T extends SegmentValue> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Text colour while not chosen, e.g. a thread kind's colour. */
  color?: string;
}

type Labelled = { 'aria-label': string; 'aria-labelledby'?: never } | { 'aria-labelledby': string; 'aria-label'?: never };

export type SegmentedControlProps<T extends SegmentValue> = Labelled & {
  options: readonly SegmentOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  look?: 'pills' | 'tray';
  size?: 'sm' | 'md';
  /** Stretch the options to fill the row. */
  fill?: boolean;
  disabled?: boolean;
  className?: string;
};

export function SegmentedControl<T extends SegmentValue>({
  options, value, onChange, look = 'pills', size = 'sm', fill = false, disabled = false, className = '', ...labelling
}: SegmentedControlProps<T>) {
  const enabled = options.filter(o => !o.disabled);
  const chosen = options.findIndex(o => o.value === value);
  // With nothing chosen, the first enabled option takes the Tab stop.
  const tabStop = chosen >= 0 && !options[chosen].disabled ? chosen : options.findIndex(o => !o.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || disabled || enabled.length === 0) return;
    e.preventDefault();
    const at = enabled.findIndex(o => o.value === value);
    const next = enabled[at === -1 ? 0 : (at + step + enabled.length) % enabled.length];
    if (next.value !== value) onChange(next.value);
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[options.indexOf(next)]?.focus();
  };

  const cls = ['cm-seg', `is-${look}`, `is-${size}`, fill && 'is-fill', className].filter(Boolean).join(' ');

  return (
    <div role="radiogroup" {...labelling} className={cls} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled || o.disabled}
            title={o.title}
            className={checked ? 'cm-seg-opt is-active' : 'cm-seg-opt'}
            style={!checked && o.color ? { color: o.color } : undefined}
            onClick={() => { if (!checked) onChange(o.value); }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A single on/off option in the pills look: attunement, DM-only, a shared part. */
export function TogglePill({ pressed, onChange, children, size = 'sm', title, disabled }: {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
  size?: 'sm' | 'md';
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      className={`cm-seg-opt is-solo is-${size}${pressed ? ' is-active' : ''}`}
      onClick={() => onChange(!pressed)}
    >
      {children}
    </button>
  );
}
