import { useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { blankSession, liveSession, localToday, nextPlanned, nextSessionNumber } from '../lib/sessionLifecycle';
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

/**
 * Moves the session along when the DM starts or ends one: starting makes the
 * next planned session live; ending marks the live one played, dated today if
 * it has no date.
 */
export function useSessionRunStatus(): (starting: boolean) => Promise<void> {
  const { sessions, updateSession } = useCampaign();
  return useCallback(async (starting: boolean) => {
    if (starting) {
      const next = liveSession(sessions) ? null : nextPlanned(sessions);
      if (next) await updateSession(next.id, { status: 'live' });
      return;
    }
    const live = liveSession(sessions);
    if (live) await updateSession(live.id, { status: 'done', session_date: live.session_date ?? localToday() });
  }, [sessions, updateSession]);
}
