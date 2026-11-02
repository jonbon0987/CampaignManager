// Loads a campaign's items and holdings once, and keeps them as the DM edits,
// gives and takes. Reloads when deleted records come back.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Items, ItemHoldings } from '../lib/db';
import { RESTORED_EVENT } from '../lib/trash';
import { useDeletedToast } from '../hooks/useDeletedToast';
import { useToast } from './ToastContext';
import { ItemsContext, type ItemsValue } from './items';
import type { Item, ItemHolding } from '../lib/database.types';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

export function ItemsProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const toast = useToast();
  const deletedToast = useDeletedToast();
  const [items, setItems] = useState<Item[]>([]);
  const [holdings, setHoldings] = useState<ItemHolding[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([Items.getByCampaign(campaignId), ItemHoldings.getByCampaign(campaignId)])
      .then(([i, h]) => { if (live) { setItems(i); setHoldings(h); setLoaded(true); } })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [campaignId, reloads]);

  useEffect(() => {
    const reload = () => setReloads(n => n + 1);
    window.addEventListener(RESTORED_EVENT, reload);
    return () => window.removeEventListener(RESTORED_EVENT, reload);
  }, []);

  const saveItem = useCallback<ItemsValue['saveItem']>(async item => {
    const saved = await Items.upsert({ ...item, campaign_id: campaignId });
    setItems(prev => (prev.some(i => i.id === saved.id) ? prev.map(i => (i.id === saved.id ? saved : i)) : [...prev, saved]).sort(byName));
    return saved;
  }, [campaignId]);

  const deleteItem = useCallback<ItemsValue['deleteItem']>(async id => {
    const name = items.find(i => i.id === id)?.name;
    await Items.delete(id);
    setItems(prev => prev.filter(i => i.id !== id));
    setHoldings(prev => prev.filter(h => h.item_id !== id));
    // A draft left blank is removed quietly; anything named can be brought back.
    if (name?.trim()) deletedToast('Item deleted', 'items', id);
  }, [items, deletedToast]);

  const give = useCallback<ItemsValue['give']>(async holding => {
    const saved = await ItemHoldings.upsert({ attuned: false, note: null, ...holding, campaign_id: campaignId });
    setHoldings(prev => [...prev, saved]);
    return saved;
  }, [campaignId]);

  const updateHolding = useCallback<ItemsValue['updateHolding']>(async (holding, patch) => {
    const next = { ...holding, ...patch };
    setHoldings(prev => prev.map(h => (h.id === holding.id ? next : h)));
    try {
      await ItemHoldings.upsert({
        id: next.id, campaign_id: next.campaign_id, item_id: next.item_id, pc_id: next.pc_id,
        quantity: next.quantity, attuned: next.attuned, session_id: next.session_id, note: next.note,
      });
    } catch (e) {
      setHoldings(prev => prev.map(h => (h.id === holding.id ? holding : h)));
      toast(errorMessage(e), 'error');
    }
  }, [toast]);

  const removeHolding = useCallback<ItemsValue['removeHolding']>(async holding => {
    setHoldings(prev => prev.filter(h => h.id !== holding.id));
    try {
      await ItemHoldings.delete(holding.id);
      deletedToast('Item taken away', 'item_holdings', holding.id);
    } catch (e) {
      setHoldings(prev => [...prev, holding]);
      toast(errorMessage(e), 'error');
    }
  }, [toast, deletedToast]);

  const value = useMemo<ItemsValue>(() => ({ items, holdings, loaded, saveItem, deleteItem, give, updateHolding, removeHolding }),
    [items, holdings, loaded, saveItem, deleteItem, give, updateHolding, removeHolding]);

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}
