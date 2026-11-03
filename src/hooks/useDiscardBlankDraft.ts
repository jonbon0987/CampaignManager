import { useEffect, useRef } from 'react';

// "+ New" saves an empty record so its page can open straight away. Records
// made that way are drafts until the DM leaves them; one left without anything
// written in it is deleted, so abandoned drafts don't pile up as "Unnamed" rows.
//
// The draft list is kept in localStorage too. A reload or a closed tab skips the
// cleanup below, and the URL (or "wherever you were last") reopens the same
// record, so remembering it lets leaving it then still delete it.
const STORE_KEY = 'cm-drafts';
const KEEP = 50;
const drafts = loadDrafts();

function loadDrafts(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDrafts() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...drafts].slice(-KEEP)));
  } catch {
    // Storage off or full: drafts are still cleaned up within this visit.
  }
}
// Deletes waiting a tick, so a record that's straight back (React re-runs
// effects once in development) cancels its own delete.
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Marks a record "+ New" just created, so leaving it blank deletes it. */
export function markDraft(id: string) {
  drafts.add(id);
  saveDrafts();
}

/**
 * In a record's detail page: when the DM moves to another record or leaves the
 * tab, delete this one if it's a draft and still blank. `blank` comes from the
 * page's own form, so text that hasn't autosaved yet still counts as written.
 */
export function useDiscardBlankDraft(id: string, blank: boolean, remove: (id: string) => unknown) {
  // The values as of the last commit. The cleanup below reads these, so it sees
  // the record being left, not the one being opened.
  const latest = useRef({ id, blank, remove });
  useEffect(() => {
    latest.current = { id, blank, remove };
  });

  useEffect(() => {
    const waiting = pending.get(id);
    if (waiting) { clearTimeout(waiting); pending.delete(id); }
    return () => {
      const left = latest.current;
      if (!drafts.has(left.id)) return;
      pending.set(left.id, setTimeout(() => {
        pending.delete(left.id);
        drafts.delete(left.id);
        saveDrafts();
        if (left.blank) void Promise.resolve(left.remove(left.id)).catch(() => {});
      }, 0));
    };
  }, [id]);
}
