import { useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import { clockFullNote, clockOf, stateAfterClock } from '../lib/threadClock';
import type { Hook } from '../lib/database.types';

/**
 * Moves a thread's clock outside its editor, as Prep does. A clock that fills
 * wakes its thread and says so.
 */
export function useThreadClock() {
  const { upsertHook } = useCampaign();
  const toast = useToast();
  return useCallback(async (h: Hook, filled: number) => {
    const clock = clockOf(h);
    if (!clock) return;
    const state = h.state ?? (h.is_active ? 'active' : 'resolved');
    const next = stateAfterClock(state, clock.size, filled);
    await upsertHook({
      id: h.id, title: h.title, category: h.category, description: h.description, state: next, is_active: next !== 'resolved',
      last_updated_session: h.last_updated_session, dm_only_notes: h.dm_only_notes, clock_filled: filled,
    });
    if (filled >= clock.size && !clock.full) toast(clockFullNote(h.title, clock.label, next !== state), 'success');
  }, [upsertHook, toast]);
}
