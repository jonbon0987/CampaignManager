import { useState } from 'react';

/**
 * Which optional sections of an entry show: those with something in them, and
 * any the DM has added since opening it. The rest wait in an "Add" row, so a
 * new entry isn't a column of empty boxes.
 */
export function useOptionalSections<K extends string>(filled: Record<K, boolean>) {
  const [added, setAdded] = useState<Set<K>>(() => new Set());
  const shown = (key: K) => filled[key] || added.has(key);
  const add = (key: K) => setAdded(prev => new Set(prev).add(key));
  const hidden = (Object.keys(filled) as K[]).filter(k => !shown(k));
  return { shown, add, hidden };
}
