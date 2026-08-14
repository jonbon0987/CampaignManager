// src/components/ui/CharCounter.tsx
// -----------------------------------------------------------
// Soft character-limit indicator for prose fields. Shows `count / limit`
// and, once the value exceeds the limit, flips to a red "N over limit"
// warning. It NEVER blocks typing — users can finish/paste their text and
// then trim it. The authoritative block is the save-time validation
// (lib/fieldLimits + the db.ts write layer), which surfaces a toast naming
// the field and by how much. See also the counter baked into SlashField.
// -----------------------------------------------------------

interface CharCounterProps {
  value: string;
  /** Soft limit. When undefined, nothing renders. */
  limit?: number;
  className?: string;
}

export function CharCounter({ value, limit, className }: CharCounterProps) {
  if (limit == null) return null;
  const count = value.length;
  const over = count > limit;
  return (
    <div
      className={`cm-char-counter${className ? ' ' + className : ''}`}
      aria-live="polite"
      style={{
        textAlign: 'right',
        fontSize: '11px',
        fontFamily: 'var(--serif)',
        marginTop: '2px',
        color: over ? 'var(--red)' : 'var(--ink-3)',
      }}
    >
      {over
        ? `${(count - limit).toLocaleString()} over limit`
        : `${count.toLocaleString()} / ${limit.toLocaleString()}`}
    </div>
  );
}
