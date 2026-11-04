import { useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { liveSession, nextBlankSession, nextPlanned } from '../lib/sessionLifecycle';
import type { Session } from '../lib/database.types';

/**
 * The session to prep next: the one being played, else the next planned one,
 * else a new planned session numbered after the last.
 */
export function usePlanNextSession(): () => Promise<Session | null> {
  const { sessions, upsertSession, selectedCampaign } = useCampaign();
  const repeat = selectedCampaign?.session_repeat;
  return useCallback(async () => {
    const existing = liveSession(sessions) ?? nextPlanned(sessions);
    if (existing) return existing;
    const created = await upsertSession(nextBlankSession(sessions, repeat));
    return created?.id ? created : null;
  }, [sessions, upsertSession, repeat]);
}
