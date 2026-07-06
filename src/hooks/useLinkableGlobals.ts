import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * useLinkableGlobals
 * -----------------------------------------------------------
 * Generic state + CRUD for an entity type that exists in two
 * scopes:
 *   - campaign-specific rows (campaign_id = the selected campaign)
 *   - a shared "global" pool (campaign_id IS NULL) that individual
 *     campaigns opt into via a join table ("linked" IDs)
 *
 * Consumers see a single merged list: campaign-specific rows plus
 * the global rows the current campaign has linked.
 *
 * NPCs and Locations share this exact pattern; this hook is the one
 * implementation. To add a new linkable-global entity (e.g. Factions
 * or Lore), give it the join-table DB methods and call this hook with
 * a matching config.
 */

/**
 * Pure merge: campaign-specific rows followed by the global rows whose id is in
 * linkedIds. Exported (and unit-tested) on its own because getting this wrong is
 * exactly the "corrupted campaign" failure mode — showing/saving global entities
 * the campaign never linked, or dropping ones it did.
 */
export function mergeLinkableGlobals<T extends { id: string }>(
  campaignItems: T[],
  globalItems: T[],
  linkedIds: string[]
): T[] {
  const linkedSet = new Set(linkedIds);
  return [...campaignItems, ...globalItems.filter((g) => linkedSet.has(g.id))];
}

/** Pure: resolve the campaign_id an upsert should write for a given scope. */
export function resolveScopeCampaignId(
  scope: 'campaign' | 'global',
  selectedCampaignId: string | null
): string | null {
  return scope === 'campaign' ? selectedCampaignId : null;
}

export interface LinkableGlobalsConfig<T, TInsert> {
  /** Rows where campaign_id = campaignId. */
  getByCampaign(campaignId: string): Promise<T[]>;
  /** Rows in the global pool (campaign_id IS NULL). */
  getGlobal(): Promise<T[]>;
  /** IDs of global rows linked to campaignId via the join table. */
  getLinkedIds(campaignId: string): Promise<string[]>;
  /** Insert/update a row (campaign_id already resolved by the hook). */
  upsert(data: TInsert & { id?: string }): Promise<T>;
  /** Delete a row by id. */
  remove(id: string): Promise<void>;
  /** Link a global row to a campaign. */
  link(campaignId: string, id: string): Promise<void>;
  /** Unlink a global row from a campaign. */
  unlink(campaignId: string, id: string): Promise<void>;
}

export interface LinkableGlobalsStore<T, TInsert> {
  /** Merged: campaign-specific rows + linked global rows. */
  items: T[];
  /** Campaign-specific rows only. */
  campaignItems: T[];
  /** The full global pool. */
  globalItems: T[];
  /** IDs of global rows linked to the current campaign. */
  linkedIds: string[];
  /** Re-fetch all three slices for a campaign (used on load + after mutations). */
  refresh(campaignId: string): Promise<void>;
  /** Clear all local state (e.g. when no campaign is selected). */
  reset(): void;
  /** Create/update. scope 'campaign' (default) sets campaign_id; 'global' nulls it. */
  upsert(
    data: Omit<TInsert, 'campaign_id'> & { id?: string },
    scope?: 'campaign' | 'global'
  ): Promise<T>;
  remove(id: string): Promise<void>;
  /** Link a global row to the current campaign (optimistic). */
  link(id: string): Promise<void>;
  /** Unlink a global row from the current campaign (optimistic). */
  unlink(id: string): Promise<void>;
}

export function useLinkableGlobals<
  T extends { id: string },
  TInsert extends { campaign_id?: string | null },
>(
  config: LinkableGlobalsConfig<T, TInsert>,
  selectedCampaignId: string | null
): LinkableGlobalsStore<T, TInsert> {
  // Keep config in a ref so the callbacks below stay referentially stable
  // even if the caller passes a fresh config object each render. The ref is
  // updated in an effect (not during render) per the rules of refs.
  const cfgRef = useRef(config);
  useEffect(() => {
    cfgRef.current = config;
  });

  const [campaignItems, setCampaignItems] = useState<T[]>([]);
  const [globalItems, setGlobalItems] = useState<T[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  const items = useMemo(
    () => mergeLinkableGlobals(campaignItems, globalItems, linkedIds),
    [campaignItems, globalItems, linkedIds]
  );

  const refresh = useCallback(async (campaignId: string) => {
    const [ci, gi, ids] = await Promise.all([
      cfgRef.current.getByCampaign(campaignId),
      cfgRef.current.getGlobal(),
      cfgRef.current.getLinkedIds(campaignId),
    ]);
    setCampaignItems(ci);
    setGlobalItems(gi);
    setLinkedIds(ids);
  }, []);

  const reset = useCallback(() => {
    setCampaignItems([]);
    setGlobalItems([]);
    setLinkedIds([]);
  }, []);

  const upsert = useCallback(
    async (
      data: Omit<TInsert, 'campaign_id'> & { id?: string },
      scope: 'campaign' | 'global' = 'campaign'
    ): Promise<T> => {
      if (!selectedCampaignId) return {} as T;
      const campaign_id = resolveScopeCampaignId(scope, selectedCampaignId);
      const result = await cfgRef.current.upsert({
        ...data,
        campaign_id,
      } as TInsert & { id?: string });
      await refresh(selectedCampaignId);
      return result;
    },
    [selectedCampaignId, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!selectedCampaignId) return;
      await cfgRef.current.remove(id);
      await refresh(selectedCampaignId);
    },
    [selectedCampaignId, refresh]
  );

  const link = useCallback(
    async (id: string) => {
      if (!selectedCampaignId) return;
      await cfgRef.current.link(selectedCampaignId, id);
      setLinkedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [selectedCampaignId]
  );

  const unlink = useCallback(
    async (id: string) => {
      if (!selectedCampaignId) return;
      await cfgRef.current.unlink(selectedCampaignId, id);
      setLinkedIds((prev) => prev.filter((x) => x !== id));
    },
    [selectedCampaignId]
  );

  return {
    items,
    campaignItems,
    globalItems,
    linkedIds,
    refresh,
    reset,
    upsert,
    remove,
    link,
    unlink,
  };
}
