// Loads a campaign's player page and shared items once, and keeps them as the
// DM switches things on and off. Switches change at once and go back if the
// save fails.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PlayerPages, PlayerShares } from '../lib/db';
import { newPageToken } from '../lib/playerPage';
import { useToast } from './ToastContext';
import { PlayerSharesContext, type PlayerSharesValue } from './playerShares';
import type { PlayerPageLink, ShareKind } from '../lib/database.types';

const keyOf = (kind: ShareKind, id: string) => `${kind}:${id}`;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PlayerShareProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const toast = useToast();
  const [page, setPage] = useState<PlayerPageLink | null>(null);
  const [shared, setSharedKeys] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([PlayerPages.get(campaignId), PlayerShares.getByCampaign(campaignId)])
      .then(([p, rows]) => {
        if (!live) return;
        setPage(p);
        setSharedKeys(new Set(rows.map(r => keyOf(r.kind, r.item_id))));
        setLoaded(true);
      })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [campaignId]);

  const flip = (key: string, on: boolean) => setSharedKeys(prev => {
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });

  const setShared = useCallback(async (kind: ShareKind, id: string, on: boolean) => {
    flip(keyOf(kind, id), on);
    try {
      await PlayerShares.set(campaignId, kind, id, on);
    } catch (e) {
      flip(keyOf(kind, id), !on);
      toast(errorMessage(e), 'error');
    }
  }, [campaignId, toast]);

  const issueLink = useCallback(async () => {
    try {
      setPage(await PlayerPages.issue(campaignId, newPageToken()));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [campaignId, toast]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    try {
      setPage(await PlayerPages.setEnabled(campaignId, enabled));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [campaignId, toast]);

  const setPart = useCallback<PlayerSharesValue['setPart']>(async (part, on) => {
    try {
      setPage(await PlayerPages.setPart(campaignId, part, on));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [campaignId, toast]);

  const value = useMemo<PlayerSharesValue>(() => ({
    campaignId,
    page,
    loaded,
    isShared: (kind, id) => shared.has(keyOf(kind, id)),
    setShared,
    sharedIds: kind => [...shared].filter(k => k.startsWith(`${kind}:`)).map(k => k.slice(kind.length + 1)),
    issueLink,
    setEnabled,
    setPart,
  }), [campaignId, page, loaded, shared, setShared, issueLink, setEnabled, setPart]);

  return <PlayerSharesContext.Provider value={value}>{children}</PlayerSharesContext.Provider>;
}
