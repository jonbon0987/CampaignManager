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
  // True from an edit until its save starts. Kept apart from timerRef because
  // the data effect's cleanup clears the timer before the unmount flush runs.
  const pendingRef = useRef(false);
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
    pendingRef.current = false;
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

  // ⌘S / Ctrl+S saves a pending change right away, and keeps the browser's
  // own "Save page" dialog from opening while an autosaving editor is open.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's' || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (timerRef.current) void saveNow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, saveNow]);

  // Watch data changes and schedule debounced save
  useEffect(() => {
    if (!enabled) return;

    const serialized = JSON.stringify(data);
    // Don't trigger save if data matches the last saved state
    if (serialized === initialDataRef.current) { pendingRef.current = false; return; }

    setStatus('unsaved');
    pendingRef.current = true;

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

  // Flush on unmount: an edit still waiting for its debounce is saved now, so
  // switching records right after typing doesn't lose it.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current) {
        pendingRef.current = false;
        // Fire-and-forget flush — can't await in cleanup
        void Promise.resolve(onSaveRef.current(latestDataRef.current))
          .catch(err => console.error('Couldn’t save on close', err));
      }
    };
  }, []);

  return { status, saveNow, error };
}
