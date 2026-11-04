import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Item, ItemHolding } from '../lib/database.types';

const h = vi.hoisted(() => ({
  getTreasury: vi.fn().mockResolvedValue([]),
  insertTreasury: vi.fn(),
  deleteTreasury: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
  deletedToast: vi.fn(),
  getItems: vi.fn(),
  upsertItem: vi.fn(),
  deleteItem: vi.fn(),
  getHoldings: vi.fn(),
  upsertHolding: vi.fn(),
  deleteHolding: vi.fn(),
}));
vi.mock('./ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useDeletedToast', () => ({ useDeletedToast: () => h.deletedToast }));
vi.mock('../lib/db', () => ({
  Items: { getByCampaign: h.getItems, upsert: h.upsertItem, delete: h.deleteItem },
  ItemHoldings: { getByCampaign: h.getHoldings, upsert: h.upsertHolding, delete: h.deleteHolding },
  TreasuryEntries: { getByCampaign: h.getTreasury, insert: h.insertTreasury, delete: h.deleteTreasury },
}));

import { ItemsProvider } from './ItemsContext';
import { useItems } from './items';
import { RESTORED_EVENT } from '../lib/trash';

const item = (id: string, name: string): Item => ({
  id, name, user_id: 'u', campaign_id: 'c1', item_type: null, rarity: null, attunement: false, attunement_note: null,
  value: null, description: null, dm_notes: null, image_path: null, created_at: '', updated_at: '',
});
const holding = (id: string, item_id: string, pc_id: string | null): ItemHolding => ({
  id, item_id, pc_id, user_id: 'u', campaign_id: 'c1', quantity: 1, attuned: false, session_id: null, note: null, created_at: '', updated_at: '',
});

const sword = item('i1', 'Flame Tongue');
const bag = item('i2', 'Bag of Holding');

const wrapper = ({ children }: { children: ReactNode }) => <ItemsProvider campaignId="c1">{children}</ItemsProvider>;

async function loaded() {
  const hook = renderHook(() => useItems()!, { wrapper });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

describe('ItemsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getItems.mockResolvedValue([bag, sword]);
    h.getHoldings.mockResolvedValue([holding('h1', 'i1', 'p1')]);
    h.upsertItem.mockImplementation(async (i: Partial<Item>) => ({ ...item(i.id ?? 'new', ''), ...i }));
    h.upsertHolding.mockImplementation(async (x: Partial<ItemHolding>) => ({ ...holding(x.id ?? 'hn', x.item_id!, x.pc_id ?? null), ...x }));
    h.deleteItem.mockResolvedValue(undefined);
    h.deleteHolding.mockResolvedValue(undefined);
  });

  it('loads the campaign’s items and holdings', async () => {
    const { result } = await loaded();
    expect(h.getItems).toHaveBeenCalledWith('c1');
    expect(result.current.items.map(i => i.name)).toEqual(['Bag of Holding', 'Flame Tongue']);
    expect(result.current.holdings).toHaveLength(1);
  });

  it('adds a new item in name order, and saves an edit in place', async () => {
    const { result } = await loaded();
    await act(async () => { await result.current.saveItem({ ...item('x', 'Amulet'), id: undefined } as never); });
    expect(h.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Amulet', campaign_id: 'c1' }));
    expect(result.current.items.map(i => i.name)).toEqual(['Amulet', 'Bag of Holding', 'Flame Tongue']);

    await act(async () => { await result.current.saveItem({ id: 'i1', name: 'Frost Brand' } as never); });
    expect(result.current.items.map(i => i.name)).toEqual(['Amulet', 'Bag of Holding', 'Frost Brand']);
  });

  it('deleting an item takes its holdings with it, and offers Undo', async () => {
    const { result } = await loaded();
    await act(() => result.current.deleteItem('i1'));
    expect(h.deleteItem).toHaveBeenCalledWith('i1');
    expect(result.current.items.map(i => i.id)).toEqual(['i2']);
    expect(result.current.holdings).toEqual([]);
    expect(h.deletedToast).toHaveBeenCalledWith('Item deleted', 'items', 'i1');
  });

  it('removes a blank draft quietly', async () => {
    h.getItems.mockResolvedValue([item('d', '')]);
    const { result } = await loaded();
    await act(() => result.current.deleteItem('d'));
    expect(h.deletedToast).not.toHaveBeenCalled();
  });

  it('gives an item to someone', async () => {
    const { result } = await loaded();
    await act(async () => { await result.current.give({ item_id: 'i2', pc_id: null, quantity: 3, session_id: 's1' }); });
    expect(h.upsertHolding).toHaveBeenCalledWith({ item_id: 'i2', pc_id: null, quantity: 3, session_id: 's1', attuned: false, note: null, campaign_id: 'c1' });
    expect(result.current.holdings).toHaveLength(2);
  });

  it('changes a holding at once, and puts it back if the save fails', async () => {
    const { result } = await loaded();
    const h1 = result.current.holdings[0];
    await act(() => result.current.updateHolding(h1, { attuned: true }));
    expect(h.upsertHolding).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', attuned: true, item_id: 'i1', pc_id: 'p1' }));
    expect(result.current.holdings[0].attuned).toBe(true);

    h.upsertHolding.mockRejectedValueOnce(new Error('Offline'));
    const current = result.current.holdings[0];
    await act(() => result.current.updateHolding(current, { quantity: 5 }));
    expect(result.current.holdings[0].quantity).toBe(1);
    expect(h.toast).toHaveBeenCalledWith('Offline', 'error');
  });

  describe('the treasury', () => {
    const line = (id: string, gp: number) => ({ id, gp, cp: 0, sp: 0, ep: 0, pp: 0, note: null, session_id: null, pc_id: null, campaign_id: 'c1', user_id: 'u', created_at: '', updated_at: '' });

    it('loads the ledger, and adds lines to the front with every coin filled in', async () => {
      h.getTreasury.mockResolvedValue([line('a', 10)]);
      h.insertTreasury.mockImplementation(async (rows: { gp: number }[]) => rows.map((r, i) => line(`n${i}`, r.gp)));
      const { result } = await loaded();
      expect(result.current.treasury.map(t => t.id)).toEqual(['a']);
      await act(() => result.current.addTreasury([{ gp: 5, note: 'A bribe' }]));
      expect(h.insertTreasury).toHaveBeenCalledWith([{ cp: 0, sp: 0, ep: 0, gp: 5, pp: 0, note: 'A bribe', session_id: null, pc_id: null, campaign_id: 'c1' }]);
      expect(result.current.treasury.map(t => t.id)).toEqual(['n0', 'a']);
    });

    it('says so and passes the failure on when a line won’t save', async () => {
      h.getTreasury.mockResolvedValue([]);
      h.insertTreasury.mockRejectedValueOnce(new Error('Offline'));
      const { result } = await loaded();
      await expect(result.current.addTreasury([{ gp: 5 }])).rejects.toThrow('Offline');
      expect(h.toast).toHaveBeenCalledWith('Offline', 'error');
    });

    it('removes a line with Undo, and puts it back if the delete fails', async () => {
      h.getTreasury.mockResolvedValue([line('a', 10)]);
      const { result } = await loaded();
      await act(() => result.current.removeTreasury(result.current.treasury[0]));
      expect(result.current.treasury).toEqual([]);
      expect(h.deletedToast).toHaveBeenCalledWith('Treasury line removed', 'treasury_entries', 'a');

      h.deleteTreasury.mockRejectedValueOnce(new Error('Offline'));
      const again = await loaded();
      await act(() => again.result.current.removeTreasury(again.result.current.treasury[0]));
      expect(again.result.current.treasury.map(t => t.id)).toEqual(['a']);
    });
  });

  it('takes an item away with Undo, and puts it back if the delete fails', async () => {
    const { result } = await loaded();
    const h1 = result.current.holdings[0];
    await act(() => result.current.removeHolding(h1));
    expect(result.current.holdings).toEqual([]);
    expect(h.deletedToast).toHaveBeenCalledWith('Item taken away', 'item_holdings', 'h1');

    h.deleteHolding.mockRejectedValueOnce(new Error('Offline'));
    h.getHoldings.mockResolvedValue([h1]);
    const again = await loaded();
    await act(() => again.result.current.removeHolding(h1));
    expect(again.result.current.holdings).toEqual([h1]);
    expect(h.toast).toHaveBeenCalledWith('Offline', 'error');
  });

  it('reloads when deleted records come back', async () => {
    await loaded();
    expect(h.getItems).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event(RESTORED_EVENT)); });
    await waitFor(() => expect(h.getItems).toHaveBeenCalledTimes(2));
  });

  it('is absent outside a campaign', () => {
    const { result } = renderHook(() => useItems());
    expect(result.current).toBeNull();
  });
});
