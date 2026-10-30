import { useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { blankSession, liveSession, nextPlanned, nextSessionNumber } from '../lib/sessionLifecycle';
import type { Session } from '../lib/database.types';

/**
 * The session to prep next: the one being played, else the next planned one,
 * else a new planned session numbered after the last.
 */
export function usePlanNextSession(): () => Promise<Session | null> {
  const { sessions, upsertSession } = useCampaign();
  return useCallback(async () => {
    const existing = liveSession(sessions) ?? nextPlanned(sessions);
    if (existing) return existing;
    const created = await upsertSession(blankSession(nextSessionNumber(sessions)));
    return created?.id ? created : null;
  }, [sessions, upsertSession]);
}
