import { useState } from 'react';
import type { Origin } from '../ui/OriginBand';

/**
 * An entry imported from world canon is shared by every campaign that uses it,
 * so in a campaign it opens locked; "Edit canon" unlocks it until the editor
 * closes. Local entries, and canon edited from the world itself, are never locked.
 */
export function useCanonLock(origin: Origin | undefined) {
  const [unlocked, setUnlocked] = useState(false);
  const locked = origin === 'imported' && !unlocked;
  return { locked, unlock: () => setUnlocked(true) };
}
