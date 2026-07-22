// Supabase/PostgREST rejects with a plain object ({ message, details, hint,
// code }), NOT an Error instance. Code that checks `err instanceof Error`
// therefore throws away the real message and shows a generic fallback, which
// is exactly what made assistant commit failures surface as "Something went
// wrong" with no cause. This helper pulls the best available message out of
// whatever was thrown.
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error) return err.message || fallback;

  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    if (parts.length > 0) {
      const base = parts.join(' — ');
      return typeof e.code === 'string' && e.code ? `${base} (${e.code})` : base;
    }
  }

  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}
