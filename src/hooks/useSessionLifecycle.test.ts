import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeCampaignContext } from '../test/contextMocks';
import { makeSession } from '../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as Record<string, unknown> | null } }));
vi.mock('../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));

import { usePlanNextSession, useSessionRunStatus } from './useSessionLifecycle';
import { localToday } from '../lib/sessionLifecycle';

const updateSession = vi.fn();
const upsertSession = vi.fn();
const use = (sessions: ReturnType<typeof makeSession>[]) => {
  h.campaign.value = makeCampaignContext({ sessions, updateSession, upsertSession });
};

beforeEach(() => {
  updateSession.mockReset().mockResolvedValue({});
  upsertSession.mockReset().mockResolvedValue({ id: 'new' });
});

describe('useSessionRunStatus', () => {
  it('starting makes the next planned session live', async () => {
    use([makeSession({ id: 's1', session_number: 1 }), makeSession({ id: 's3', session_number: 3, status: 'planned' }), makeSession({ id: 's2', session_number: 2, status: 'planned' })]);
    const { result } = renderHook(() => useSessionRunStatus());
    await result.current(true);
    expect(updateSession).toHaveBeenCalledWith('s2', { status: 'live' });
  });

  it('starting leaves things alone when a session is already live, or none is planned', async () => {
    use([makeSession({ id: 's1', status: 'live' }), makeSession({ id: 's2', session_number: 2, status: 'planned' })]);
    await renderHook(() => useSessionRunStatus()).result.current(true);
    use([makeSession({ id: 's1' })]);
    await renderHook(() => useSessionRunStatus()).result.current(true);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('ending marks the live session played, dated today unless it has a date', async () => {
    use([makeSession({ id: 's4', session_number: 4, status: 'live' })]);
    await renderHook(() => useSessionRunStatus()).result.current(false);
    expect(updateSession).toHaveBeenCalledWith('s4', { status: 'done', session_date: localToday() });

    use([makeSession({ id: 's4', session_number: 4, status: 'live', session_date: '2026-10-20' })]);
    await renderHook(() => useSessionRunStatus()).result.current(false);
    expect(updateSession).toHaveBeenLastCalledWith('s4', { status: 'done', session_date: '2026-10-20' });
  });
});

describe('usePlanNextSession', () => {
  it('returns the planned session if there is one', async () => {
    use([makeSession({ id: 's1' }), makeSession({ id: 's2', session_number: 2, status: 'planned' })]);
    expect((await renderHook(() => usePlanNextSession()).result.current())?.id).toBe('s2');
    expect(upsertSession).not.toHaveBeenCalled();
  });

  it('plans a new session after the last when none is planned', async () => {
    use([makeSession({ id: 's1', session_number: 7 })]);
    expect((await renderHook(() => usePlanNextSession()).result.current())?.id).toBe('new');
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ session_number: 8, status: 'planned' }));
  });
});
