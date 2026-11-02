import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PlayerPageLink, PlayerShare } from '../lib/database.types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  getPage: vi.fn(),
  issue: vi.fn(),
  setEnabled: vi.fn(),
  getShares: vi.fn(),
  setShare: vi.fn(),
}));
vi.mock('./ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../lib/db', () => ({
  PlayerPages: { get: h.getPage, issue: h.issue, setEnabled: h.setEnabled },
  PlayerShares: { getByCampaign: h.getShares, set: h.setShare },
}));

import { PlayerShareProvider } from './PlayerShareContext';
import { usePlayerShares } from './playerShares';

const page: PlayerPageLink = { campaign_id: 'c1', user_id: 'u', token: 't'.repeat(32), enabled: true, created_at: '', updated_at: '' };
const share = (kind: PlayerShare['kind'], item_id: string): PlayerShare => ({ campaign_id: 'c1', user_id: 'u', kind, item_id, created_at: '' });

const wrapper = ({ children }: { children: ReactNode }) => <PlayerShareProvider campaignId="c1">{children}</PlayerShareProvider>;

async function loaded() {
  const hook = renderHook(() => usePlayerShares()!, { wrapper });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

describe('PlayerShareProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getPage.mockResolvedValue(page);
    h.getShares.mockResolvedValue([share('npc', 'n1'), share('npc', 'n2'), share('session', 's1')]);
    h.setShare.mockResolvedValue(undefined);
  });

  it('loads the campaign page and what is shared on it', async () => {
    const { result } = await loaded();
    expect(h.getPage).toHaveBeenCalledWith('c1');
    expect(result.current.page).toEqual(page);
    expect(result.current.isShared('npc', 'n1')).toBe(true);
    expect(result.current.isShared('location', 'n1')).toBe(false);
    expect(result.current.sharedIds('npc')).toEqual(['n1', 'n2']);
    expect(result.current.sharedIds('session')).toEqual(['s1']);
  });

  it('switches an item at once and saves it', async () => {
    const { result } = await loaded();
    await act(() => result.current.setShared('lore', 'e1', true));
    expect(h.setShare).toHaveBeenCalledWith('c1', 'lore', 'e1', true);
    expect(result.current.isShared('lore', 'e1')).toBe(true);
    await act(() => result.current.setShared('npc', 'n1', false));
    expect(result.current.isShared('npc', 'n1')).toBe(false);
  });

  it('puts the switch back and says why when the save fails', async () => {
    h.setShare.mockRejectedValue(new Error('Offline'));
    const { result } = await loaded();
    await act(() => result.current.setShared('npc', 'n1', false));
    expect(result.current.isShared('npc', 'n1')).toBe(true);
    expect(h.toast).toHaveBeenCalledWith('Offline', 'error');
  });

  it('issues a fresh random link, and turns the page off and on', async () => {
    h.getPage.mockResolvedValue(null);
    const renewed = { ...page, token: 'n'.repeat(32) };
    h.issue.mockResolvedValue(renewed);
    h.setEnabled.mockImplementation(async (_c: string, enabled: boolean) => ({ ...renewed, enabled }));
    const { result } = await loaded();
    expect(result.current.page).toBeNull();

    await act(() => result.current.issueLink());
    expect(h.issue).toHaveBeenCalledWith('c1', expect.stringMatching(/^[A-Za-z0-9_-]{32}$/));
    expect(result.current.page).toEqual(renewed);

    await act(() => result.current.setEnabled(false));
    expect(h.setEnabled).toHaveBeenCalledWith('c1', false);
    expect(result.current.page?.enabled).toBe(false);
  });

  it('is absent outside a campaign', () => {
    const { result } = renderHook(() => usePlayerShares());
    expect(result.current).toBeNull();
  });
});
