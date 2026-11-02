// A campaign's items and who holds them. The provider is ItemsContext.tsx;
// outside a campaign there's none, and useItems() returns null.

import { createContext, useContext } from 'react';
import type { Item, ItemHolding, ItemHoldingInsert, ItemInsert } from '../lib/database.types';

export type NewHolding = Omit<ItemHoldingInsert, 'campaign_id' | 'attuned' | 'note'> & Partial<Pick<ItemHolding, 'attuned' | 'note'>>;

export interface ItemsValue {
  items: Item[];
  holdings: ItemHolding[];
  loaded: boolean;
  /** Creates an item, or saves one (with its id). */
  saveItem: (item: Omit<ItemInsert, 'campaign_id'> & { id?: string }) => Promise<Item>;
  /** Deletes an item and its holdings; the toast offers Undo. */
  deleteItem: (id: string) => Promise<void>;
  /** Gives an item to a PC, or to the party with pc_id null. */
  give: (holding: NewHolding) => Promise<ItemHolding>;
  updateHolding: (holding: ItemHolding, patch: Partial<Pick<ItemHolding, 'pc_id' | 'quantity' | 'attuned' | 'note' | 'session_id'>>) => Promise<void>;
  /** Takes it away; the toast offers Undo. */
  removeHolding: (holding: ItemHolding) => Promise<void>;
}

export const ItemsContext = createContext<ItemsValue | null>(null);

export function useItems(): ItemsValue | null {
  return useContext(ItemsContext);
}
