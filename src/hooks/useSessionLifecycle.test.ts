import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeCampaignContext } from '../test/contextMocks';
import { makeSession } from '../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as Record<string, unknown> | null } }));
vi.mock('../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));

import { usePlanNextSession } from './useSessionLifecycle';

const upsertSession = vi.fn();
const use = (sessions: ReturnType<typeof makeSession>[]) => {
  h.campaign.value = makeCampaignContext({ sessions, upsertSession });
};

beforeEach(() => {
  upsertSession.mockReset().mockResolvedValue({ id: 'new' });
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
