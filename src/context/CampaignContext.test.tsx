import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Session } from '../lib/database.types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  sessionsUpdate: vi.fn(),
  sessionsGetAll: vi.fn(),
  campaignsUpsert: vi.fn(),
  campaignsGetAll: vi.fn(),
}));

vi.mock('./ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useDeletedToast', () => ({ useDeletedToast: () => vi.fn() }));
vi.mock('../lib/db', () => {
  // Everything the provider loads that these tests don't look at comes back empty.
  const empty = new Proxy({}, { get: () => async () => [] });
  const names = [
    'CampaignNPCs', 'CampaignLocations', 'CampaignLore', 'PlayerCharacters', 'NPCs', 'Locations', 'Factions', 'Hooks',
    'Ideas', 'Lore', 'Modules', 'Relationships', 'Submodules', 'Scenes', 'ModuleSheets', 'MonsterStatblocks',
    'Encounters', 'RandomEncounterTables', 'ModuleDeps', 'SubmoduleDeps',
  ];
  return {
    ...Object.fromEntries(names.map(n => [n, empty])),
    Campaigns: { getAll: h.campaignsGetAll, upsert: h.campaignsUpsert },
    Sessions: { getAll: h.sessionsGetAll, update: h.sessionsUpdate },
  };
});

import { CampaignProvider, useCampaign } from './CampaignContext';

const row = { id: 's7', campaign_id: 'c1', session_number: 7, status: 'planned', session_date: null, session_time: null, updated_at: 't0' } as unknown as Session;
const campaign = { id: 'c1', name: 'Test', description: null, sort_order: 0, title: 'Test', plot_summary: null, major_characters: null, world_info: null, world_id: 'w1', session_repeat: null };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <CampaignProvider campaignId="c1" worldId="w1">{children}</CampaignProvider>;
}

async function setup() {
  const { result } = renderHook(() => useCampaign(), { wrapper: Wrapper });
  await waitFor(() => {
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.selectedCampaign?.id).toBe('c1');
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.sessionsGetAll.mockResolvedValue([row]);
  h.campaignsGetAll.mockResolvedValue([campaign]);
});

describe('updateSession', () => {
  it('shows an edit before the write is back, so an input doesn’t snap back', async () => {
    const ctx = await setup();
    const write = deferred<Session>();
    h.sessionsUpdate.mockReturnValueOnce(write.promise);
    let done!: Promise<Session>;
    act(() => { done = ctx.current.updateSession('s7', { session_date: '2026-11-14' }); });
    expect(ctx.current.sessions[0].session_date).toBe('2026-11-14');
    await act(async () => { write.resolve({ ...row, session_date: '2026-11-14', updated_at: 't1' }); await done; });
    expect(ctx.current.sessions[0].session_date).toBe('2026-11-14');
    expect(ctx.current.sessions[0].updated_at).toBe('t1');
  });

  // Each write's answer carries the row as it stood then, without the other edit.
  const dated = { ...row, session_date: '2026-11-14', updated_at: 't1' };
  const timed = { ...row, session_time: '19:30', updated_at: 't2' };

  it.each([
    ['in order', ['date', 'time']],
    ['out of order', ['time', 'date']],
  ])('keeps both of two quick edits when the answers come %s', async (_name, order) => {
    const ctx = await setup();
    const date = deferred<Session>();
    const time = deferred<Session>();
    h.sessionsUpdate.mockReturnValueOnce(date.promise).mockReturnValueOnce(time.promise);
    let saves: Promise<Session>[] = [];
    act(() => { saves = [ctx.current.updateSession('s7', { session_date: '2026-11-14' }), ctx.current.updateSession('s7', { session_time: '19:30' })]; });
    await act(async () => {
      for (const which of order) {
        if (which === 'date') date.resolve(dated); else time.resolve(timed);
        await (which === 'date' ? saves[0] : saves[1]);
      }
    });
    expect(ctx.current.sessions[0].session_date).toBe('2026-11-14');
    expect(ctx.current.sessions[0].session_time).toBe('19:30');
  });

  it('takes an edit back and says so if it doesn’t save, leaving other edits alone', async () => {
    const ctx = await setup();
    h.sessionsUpdate.mockResolvedValueOnce(timed).mockRejectedValueOnce(new Error('No connection'));
    await act(async () => { await ctx.current.updateSession('s7', { session_time: '19:30' }); });
    await act(async () => {
      await expect(ctx.current.updateSession('s7', { session_date: '2026-11-14' })).rejects.toThrow('No connection');
    });
    expect(ctx.current.sessions[0].session_date).toBeNull();
    expect(ctx.current.sessions[0].session_time).toBe('19:30');
    expect(h.toast).toHaveBeenCalledWith('No connection', 'error');
  });
});

describe('updateCampaign', () => {
  it('shows a change before the write is back', async () => {
    const ctx = await setup();
    const write = deferred<unknown>();
    h.campaignsUpsert.mockReturnValueOnce(write.promise);
    h.campaignsGetAll.mockResolvedValue([{ ...campaign, session_repeat: 'weekly' }]);
    let done!: Promise<void>;
    act(() => { done = ctx.current.updateCampaign('c1', { session_repeat: 'weekly' }); });
    expect(ctx.current.selectedCampaign?.session_repeat).toBe('weekly');
    await act(async () => { write.resolve({}); await done; });
    expect(ctx.current.selectedCampaign?.session_repeat).toBe('weekly');
  });

  it('takes a change back if it doesn’t save, and lets the caller say so', async () => {
    const ctx = await setup();
    h.campaignsUpsert.mockRejectedValueOnce(new Error('No connection'));
    await act(async () => {
      await expect(ctx.current.updateCampaign('c1', { session_repeat: 'weekly' })).rejects.toThrow('No connection');
    });
    expect(ctx.current.selectedCampaign?.session_repeat).toBeNull();
  });
});
