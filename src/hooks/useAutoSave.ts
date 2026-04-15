import { useRef, useEffect, useState, useCallback } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave<T>({ data, onSave, delay = 2000, enabled = true }: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef(data);
  const onSaveRef = useRef(onSave);
  const initialDataRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Keep refs current
  latestDataRef.current = data;
  onSaveRef.current = onSave;

  // Capture the initial data snapshot on first render (or when enabled changes)
  useEffect(() => {
    if (enabled) {
      initialDataRef.current = JSON.stringify(data);
      setStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const doSave = useCallback(async () => {
    if (!isMountedRef.current) return;
    setStatus('saving');
    setError(null);
    try {
      await onSaveRef.current(latestDataRef.current);
      if (isMountedRef.current) {
        setStatus('saved');
        initialDataRef.current = JSON.stringify(latestDataRef.current);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    }
  }, []);

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  // Watch data changes and schedule debounced save
  useEffect(() => {
    if (!enabled) return;

    const serialized = JSON.stringify(data);
    // Don't trigger save if data matches the last saved state
    if (serialized === initialDataRef.current) return;

    setStatus('unsaved');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      doSave();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [data, delay, enabled, doSave]);

  // Flush on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // Fire-and-forget flush — can't await in cleanup
        onSaveRef.current(latestDataRef.current);
      }
    };
  }, []);

  return { status, saveNow, error };
}
