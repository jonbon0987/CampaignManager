import { useRef, useState, useEffect, useCallback } from 'react';
import type { SaveStatus } from './useAutoSave';

interface UseManualSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  /**
   * Identifier for the record being edited. When it changes, the "saved"
   * baseline is re-captured from the current data so switching records
   * doesn't leave a stale dirty state. Pair with a render-phase reset of
   * `data` (e.g. `if (prevId !== id) setForm(...)`) so the two stay in sync.
   */
  resetKey?: unknown;
}

/**
 * Manual counterpart to {@link useAutoSave}: tracks whether `data` diverges
 * from the last persisted snapshot and exposes an explicit `save()` action.
 * Nothing is written until `save()` is called.
 */
export function useManualSave<T>({ data, onSave, resetKey }: UseManualSaveOptions<T>) {
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef<string>(JSON.stringify(data));
  const dataRef = useRef(data);
  const onSaveRef = useRef(onSave);
  const isMountedRef = useRef(true);

  // Keep refs current
  dataRef.current = data;
  onSaveRef.current = onSave;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Re-baseline when the edited record changes
  useEffect(() => {
    savedRef.current = JSON.stringify(dataRef.current);
    setPhase('idle');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const isDirty = JSON.stringify(data) !== savedRef.current;

  const save = useCallback(async () => {
    if (!isMountedRef.current) return;
    setPhase('saving');
    setError(null);
    try {
      await onSaveRef.current(dataRef.current);
      savedRef.current = JSON.stringify(dataRef.current);
      if (isMountedRef.current) setPhase('saved');
    } catch (err) {
      if (isMountedRef.current) {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    }
  }, []);

  // Derive the badge status: an in-flight/failed save wins, then any pending
  // edits, then the transient "saved" confirmation.
  const status: SaveStatus =
    phase === 'saving' ? 'saving'
      : phase === 'error' ? 'error'
        : isDirty ? 'unsaved'
          : phase === 'saved' ? 'saved'
            : 'idle';

  return { status, save, isDirty, error };
}
