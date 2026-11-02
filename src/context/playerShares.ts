// What a campaign shows its players: its player page and the items switched on
// for it. The provider is PlayerShareContext.tsx; outside a campaign there's
// none, and usePlayerShares() returns null so the switches don't show.

import { createContext, useContext } from 'react';
import type { PlayerPageLink, ShareKind } from '../lib/database.types';

export interface PlayerSharesValue {
  campaignId: string;
  /** The campaign's page, or null before the DM makes one. */
  page: PlayerPageLink | null;
  loaded: boolean;
  isShared: (kind: ShareKind, id: string) => boolean;
  setShared: (kind: ShareKind, id: string, shared: boolean) => Promise<void>;
  /** Ids switched on, by kind. */
  sharedIds: (kind: ShareKind) => string[];
  /** Makes the page, or gives it a new link (the old one stops working). */
  issueLink: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

export const PlayerSharesContext = createContext<PlayerSharesValue | null>(null);

export function usePlayerShares(): PlayerSharesValue | null {
  return useContext(PlayerSharesContext);
}
