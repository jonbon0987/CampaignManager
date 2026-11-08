import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '../lib/database.types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  sessionsUpdate: vi.fn(),
  sessionsGetAll: vi.fn(),
  campaignsUpsert: vi.fn(),
  campaignsGetAll: vi.fn(),
  npcsGetByCampaign: vi.fn(),
  npcsGetGlobal: vi.fn(),
  npcsUpsert: vi.fn(),
  linksGet: vi.fn(),
  linksSetDetails: vi.fn(),
  linksLink: vi.fn(),
}));

vi.mock('./ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useDeletedToast', () => ({ useDeletedToast: () => vi.fn() }));
vi.mock('../lib/db', () => {
  // Everything the provider loads that these tests don't look at comes back empty.
  const empty = new Proxy({}, { get: () => async () => [] });
  const names = [
    'CampaignLocations', 'CampaignLore', 'PlayerCharacters', 'Locations', 'Factions', 'Hooks',
    'Ideas', 'Lore', 'Modules', 'Relationships', 'Submodules', 'Scenes', 'ModuleSheets', 'MonsterStatblocks',
    'Encounters', 'RandomEncounterTables', 'ModuleDeps', 'SubmoduleDeps',
  ];
  return {
    ...Object.fromEntries(names.map(n => [n, empty])),
    Campaigns: { getAll: h.campaignsGetAll, upsert: h.campaignsUpsert },
    Sessions: { getAll: h.sessionsGetAll, update: h.sessionsUpdate },
    NPCs: { getByCampaign: h.npcsGetByCampaign, getGlobal: h.npcsGetGlobal, upsert: h.npcsUpsert, delete: vi.fn() },
    CampaignNPCs: { getLinks: h.linksGet, setDetails: h.linksSetDetails, link: h.linksLink, unlink: vi.fn() },
  };
});

import { CampaignProvider, useCampaign } from './CampaignContext';

const row = { id: 's7', campaign_id: 'c1', session_number: 7, status: 'planned', session_date: null, session_time: null, updated_at: 't0' } as unknown as Session;
const campaign = { id: 'c1', name: 'Test', description: null, sort_order: 0, title: 'Test', plot_summary: null, major_characters: null, world_info: null, world_id: 'w1', session_repeat: null };

const own = { id: 'own', campaign_id: 'c1', world_id: 'w1', name: 'Sable', met_by_pcs: true, disposition: 'Loyal' };
// The canon row's own values are what another table once saw: never to be read here.
const canon = { id: 'canon', campaign_id: null, world_id: 'w1', name: 'Elminster', met_by_pcs: false, disposition: 'Shown to another table' };
const unlinked = { id: 'unlinked', campaign_id: null, world_id: 'w1', name: 'Vajra', met_by_pcs: true, disposition: 'Shown to another table' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <CampaignProvider campaignId="c1" worldId="w1">{children}</CampaignProvider>;
}

// A provider whose campaign can change, as following a link to another campaign does.
let setCampaign: (id: string) => void = () => {};
function Switching({ children }: { children: ReactNode }) {
  const [id, set] = useState('c1');
  useEffect(() => { setCampaign = set; }, []);
  return <CampaignProvider campaignId={id} worldId="w1">{children}</CampaignProvider>;
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
  h.npcsGetByCampaign.mockResolvedValue([own]);
  h.npcsGetGlobal.mockResolvedValue([canon, unlinked]);
  h.linksGet.mockResolvedValue([{ npc_id: 'canon', met_by_pcs: true, disposition: 'Wary' }]);
  h.npcsUpsert.mockImplementation(async (n: object) => ({ ...canon, ...n }));
  h.linksSetDetails.mockResolvedValue(undefined);
  h.linksLink.mockResolvedValue(undefined);
});

describe('which campaign it loads', () => {
  it('loads the URL’s campaign from the start, never the last one used', async () => {
    localStorage.setItem('dnd-selected-campaign-id', JSON.stringify('last-used'));
    await setup();
    expect(h.sessionsGetAll).toHaveBeenCalledWith('c1');
    expect(h.sessionsGetAll).not.toHaveBeenCalledWith('last-used');
    expect(h.linksGet).not.toHaveBeenCalledWith('last-used');
  });

  it('ignores an older load that finishes after a newer one', async () => {
    const older = deferred<Session[]>();
    h.sessionsGetAll.mockReset().mockReturnValueOnce(older.promise).mockResolvedValue([{ ...row, id: 'from-b' }]);
    const { result } = renderHook(() => useCampaign(), { wrapper: Switching });
    await act(async () => { setCampaign('c2'); });
    await waitFor(() => expect(result.current.sessions.map(s => s.id)).toEqual(['from-b']));
    await act(async () => { older.resolve([{ ...row, id: 'from-a' }]); await older.promise; });
    expect(result.current.sessions.map(s => s.id)).toEqual(['from-b']);
  });
});

describe('what a campaign knows about its NPCs', () => {
  const find = (ctx: { current: ReturnType<typeof useCampaign> }, id: string) => ctx.current.npcs.find(n => n.id === id);

  it('reads a canon NPC’s from this campaign’s link, never the shared row', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    expect(find(ctx, 'canon')).toMatchObject({ met_by_pcs: true, disposition: 'Wary' });
  });

  it('reads an NPC of the campaign’s own from its own row', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'own')).toBeTruthy());
    expect(find(ctx, 'own')).toMatchObject({ met_by_pcs: true, disposition: 'Loyal' });
  });

  it('starts a canon NPC just linked as not yet met, whatever another table knows', async () => {
    h.linksGet.mockResolvedValue([{ npc_id: 'canon', met_by_pcs: null, disposition: null }]);
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    expect(find(ctx, 'canon')).toMatchObject({ met_by_pcs: false, disposition: null });
  });

  it('saves a canon NPC’s to the link, and the rest to the canon row', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    let saved: { met_by_pcs?: boolean } | undefined;
    await act(async () => {
      saved = await ctx.current.upsertNPC({ id: 'canon', name: 'Elminster', met_by_pcs: false, disposition: 'Hostile' } as never, 'global');
    });
    expect(h.linksSetDetails).toHaveBeenCalledWith('c1', 'canon', { met_by_pcs: false, disposition: 'Hostile' });
    const written = h.npcsUpsert.mock.calls[0][0];
    expect(written).toMatchObject({ id: 'canon', name: 'Elminster', campaign_id: null });
    expect(written).not.toHaveProperty('met_by_pcs');
    expect(written).not.toHaveProperty('disposition');
    expect(saved).toMatchObject({ met_by_pcs: false, disposition: 'Hostile' });
  });

  it('doesn’t touch the link when only the shared fields change', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    await act(async () => { await ctx.current.upsertNPC({ id: 'canon', name: 'Elminster', met_by_pcs: true, disposition: 'Wary' } as never, 'global'); });
    expect(h.linksSetDetails).not.toHaveBeenCalled();
  });

  it('keeps a canon NPC in canon when a caller forgets to say so, as the assistant’s save does', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    await act(async () => { await ctx.current.upsertNPC({ id: 'canon', name: 'Elminster' } as never); });
    expect(h.npcsUpsert.mock.calls[0][0].campaign_id).toBeNull();
  });

  it('saves an NPC of the campaign’s own to its own row', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'own')).toBeTruthy());
    await act(async () => { await ctx.current.upsertNPC({ id: 'own', name: 'Sable', met_by_pcs: false, disposition: 'Cold' } as never); });
    expect(h.linksSetDetails).not.toHaveBeenCalled();
    expect(h.npcsUpsert.mock.calls[0][0]).toMatchObject({ id: 'own', campaign_id: 'c1', met_by_pcs: false, disposition: 'Cold' });
  });

  it('carries what the campaign knows onto the link when it publishes an NPC to canon', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    await act(async () => { await ctx.current.linkNPCToCampaign('unlinked', { met_by_pcs: true, disposition: 'Friendly' }); });
    expect(h.linksLink).toHaveBeenCalledWith('c1', 'unlinked', { met_by_pcs: true, disposition: 'Friendly' });
    expect(find(ctx, 'unlinked')).toMatchObject({ met_by_pcs: true, disposition: 'Friendly' });
  });

  it('knows those details before the NPC appears, so an editor opening on it starts with them', async () => {
    const ctx = await setup();
    await waitFor(() => expect(find(ctx, 'canon')).toBeTruthy());
    // The second call is the store's own, which is what puts the NPC in the list.
    h.linksLink.mockImplementationOnce(async () => {}).mockImplementationOnce(async () => {
      expect(find(ctx, 'unlinked')).toBeUndefined();
    });
    await act(async () => { await ctx.current.linkNPCToCampaign('unlinked', { met_by_pcs: true, disposition: 'Friendly' }); });
    expect(find(ctx, 'unlinked')).toMatchObject({ met_by_pcs: true, disposition: 'Friendly' });
    expect(h.linksLink.mock.calls.map(c => c.length)).toEqual([3, 2]);
  });
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
