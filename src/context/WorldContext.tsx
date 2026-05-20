import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { World, WorldCampaign, WorldTab } from '../types/world';
import {
  WORLD_NPCS, WORLD_FACTIONS, WORLD_LOCATIONS,
  WORLD_LORE, WORLD_BESTIARY, WORLD_ENCOUNTERS, WORLD_TIMELINE,
  TIMELINE_TYPE_CONFIG, ERA_CONFIG,
  WORLD_NPC_BY_ID, WORLD_LOC_BY_ID, WORLD_LORE_BY_ID,
  WORLD_FAC_BY_ID, WORLD_SB_BY_ID,
} from '../data/worldMockData';
import { Worlds as WorldsDB, Campaigns as CampaignsDB } from '../lib/db';
import type { DbWorld, Campaign } from '../lib/database.types';
import useLocalStorage from '../hooks/useLocalStorage';

// --------------- Mappers ---------------

function dbToWorld(w: DbWorld, campaignIds: string[]): World {
  return {
    id: w.id,
    name: w.name,
    tagline: w.tagline,
    era: w.era,
    calendar: w.calendar,
    year: w.year,
    campaignIds,
  };
}

function dbToWorldCampaign(c: Campaign): WorldCampaign {
  return {
    id: c.id,
    worldId: c.world_id ?? '',
    name: c.name,
    sessions: 0, // derived from sessions table when needed
    party: c.party ?? '',
    lastPlayed: c.last_played ?? '',
    status: c.status ?? 'active',
  };
}

// --------------- Context type ---------------

interface WorldContextType {
  // World selection
  worlds: World[];
  activeWorldId: string;
  setActiveWorldId: (id: string) => void;
  activeWorld: World | null;
  loading: boolean;

  createWorld: (name: string, tagline: string) => Promise<void>;
  updateWorld: (id: string, changes: Partial<World>) => Promise<void>;
  deleteWorld: (id: string) => Promise<void>;

  campaigns: WorldCampaign[];
  createCampaign: (name: string) => Promise<void>;
  updateCampaign: (id: string, changes: Partial<WorldCampaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;

  // Navigation mode
  activeCampaignId: string | null;
  activeCampaign: WorldCampaign | null;
  openCampaign: (id: string) => void;
  backToWorld: () => void;

  // World tab
  worldTab: WorldTab;
  setWorldTab: (tab: WorldTab) => void;

  // World data (mock — will move to DB later)
  npcs: typeof WORLD_NPCS;
  factions: typeof WORLD_FACTIONS;
  locations: typeof WORLD_LOCATIONS;
  lore: typeof WORLD_LORE;
  bestiary: typeof WORLD_BESTIARY;
  encounters: typeof WORLD_ENCOUNTERS;
  timeline: typeof WORLD_TIMELINE;
  timelineTypeConfig: typeof TIMELINE_TYPE_CONFIG;
  eraConfig: typeof ERA_CONFIG;

  // Lookup maps
  npcById: typeof WORLD_NPC_BY_ID;
  locById: typeof WORLD_LOC_BY_ID;
  loreById: typeof WORLD_LORE_BY_ID;
  facById: typeof WORLD_FAC_BY_ID;
  sbById: typeof WORLD_SB_BY_ID;

  // Selection state for world sub-tabs
  selected: Record<string, string>;
  setSelected: (tab: string, id: string) => void;
}

const WorldContext = createContext<WorldContextType | null>(null);

export function WorldProvider({ children }: { children: ReactNode }) {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<WorldCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  // activeWorldId stays in localStorage — it's just UI preference, not data
  const [activeWorldId, setActiveWorldId] = useLocalStorage('dnd-active-world', '');
  const [worldTab, setWorldTab] = useState<WorldTab>('overview');
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [selected, setSelectedState] = useState<Record<string, string>>({
    npcs: 'wn1',
    locations: 'wl-velden',
    lore: 'wlr-1',
    combat: 'wsb-1',
  });

  // Load worlds and campaigns from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dbWorlds, dbCampaigns] = await Promise.all([
          WorldsDB.getAll(),
          CampaignsDB.getAll(),
        ]);
        if (cancelled) return;

        // Build campaignIds per world
        const mapped: World[] = dbWorlds.map(w => dbToWorld(
          w,
          dbCampaigns.filter(c => c.world_id === w.id).map(c => c.id),
        ));
        const mappedCampaigns: WorldCampaign[] = dbCampaigns.map(dbToWorldCampaign);

        setWorlds(mapped);
        setAllCampaigns(mappedCampaigns);

        // If stored activeWorldId is gone (e.g. deleted), fall back to first world
        setActiveWorldId(prev =>
          mapped.length === 0 ? '' :
          mapped.some(w => w.id === prev) ? prev : mapped[0].id
        );
      } catch (e) {
        console.error('WorldContext: failed to load from DB', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const activeWorld = useMemo(
    () => worlds.find(w => w.id === activeWorldId) ?? null,
    [activeWorldId, worlds],
  );

  const createWorld = useCallback(async (name: string, tagline: string) => {
    const dbWorld = await WorldsDB.upsert({
      name,
      tagline: tagline || 'A new world awaits',
      era: 'First Age',
      calendar: 'Year (Y)',
      year: 1,
      sort_order: Date.now(),
    });
    const newWorld = dbToWorld(dbWorld, []);
    setWorlds(prev => [...prev, newWorld]);
    setActiveWorldId(newWorld.id);
    setWorldTab('overview');
    setActiveCampaignId(null);
  }, [setActiveWorldId]);

  const updateWorld = useCallback(async (id: string, changes: Partial<World>) => {
    // Optimistic update
    setWorlds(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));
    // Persist — map World fields back to DB shape
    const { name, tagline, era, calendar, year } = changes;
    const dbPatch: Partial<DbWorld> = {};
    if (name !== undefined) dbPatch.name = name;
    if (tagline !== undefined) dbPatch.tagline = tagline;
    if (era !== undefined) dbPatch.era = era;
    if (calendar !== undefined) dbPatch.calendar = calendar;
    if (year !== undefined) dbPatch.year = year;
    if (Object.keys(dbPatch).length) {
      await WorldsDB.upsert({ id, ...dbPatch } as DbWorld);
    }
  }, []);

  const deleteWorld = useCallback(async (id: string) => {
    if (worlds.length <= 1) return; // never delete last world
    await WorldsDB.delete(id);
    setWorlds(prev => {
      const next = prev.filter(w => w.id !== id);
      if (id === activeWorldId) setActiveWorldId(next[0]?.id ?? '');
      return next;
    });
    setAllCampaigns(prev => prev.filter(c => c.worldId !== id));
  }, [worlds.length, activeWorldId, setActiveWorldId]);

  const createCampaign = useCallback(async (name: string) => {
    const dbCampaign = await CampaignsDB.upsert({
      world_id: activeWorldId,
      name,
      description: null,
      title: null,
      plot_summary: null,
      major_characters: null,
      world_info: null,
      party: '',
      status: 'active',
      last_played: '',
      sort_order: Date.now(),
    });
    const newCampaign = dbToWorldCampaign(dbCampaign);
    setAllCampaigns(prev => [...prev, newCampaign]);
    // Attach campaign id to world in local state
    setWorlds(prev => prev.map(w =>
      w.id === activeWorldId
        ? { ...w, campaignIds: [...w.campaignIds, newCampaign.id] }
        : w
    ));
  }, [activeWorldId]);

  const updateCampaign = useCallback(async (id: string, changes: Partial<WorldCampaign>) => {
    // Optimistic update
    setAllCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    // Persist — map WorldCampaign fields back to DB shape
    const dbPatch: Partial<Campaign> = {};
    if (changes.name !== undefined) dbPatch.name = changes.name;
    if (changes.party !== undefined) dbPatch.party = changes.party;
    if (changes.status !== undefined) dbPatch.status = changes.status;
    if (changes.lastPlayed !== undefined) dbPatch.last_played = changes.lastPlayed;
    if (Object.keys(dbPatch).length) {
      await CampaignsDB.upsert({ id, ...dbPatch } as Campaign);
    }
  }, []);

  const deleteCampaign = useCallback(async (id: string) => {
    await CampaignsDB.delete(id);
    setAllCampaigns(prev => prev.filter(c => c.id !== id));
    setActiveCampaignId(prev => prev === id ? null : prev);
    setWorlds(prev => prev.map(w => ({
      ...w,
      campaignIds: w.campaignIds.filter(cid => cid !== id),
    })));
  }, []);

  const campaigns = useMemo(
    () => allCampaigns.filter(c => c.worldId === activeWorldId),
    [activeWorldId, allCampaigns],
  );

  const activeCampaign = useMemo(
    () => activeCampaignId ? campaigns.find(c => c.id === activeCampaignId) ?? null : null,
    [activeCampaignId, campaigns],
  );

  const openCampaign = useCallback((id: string) => setActiveCampaignId(id), []);
  const backToWorld = useCallback(() => setActiveCampaignId(null), []);

  const handleSetWorldTab = useCallback((tab: WorldTab) => {
    setActiveCampaignId(null);
    setWorldTab(tab);
  }, []);

  const setSelected = useCallback((tab: string, id: string) => {
    setSelectedState(prev => ({ ...prev, [tab]: id }));
  }, []);

  const npcs       = useMemo(() => WORLD_NPCS.filter(x => x.worldId === activeWorldId),       [activeWorldId]);
  const factions   = useMemo(() => WORLD_FACTIONS.filter(x => x.worldId === activeWorldId),   [activeWorldId]);
  const locations  = useMemo(() => WORLD_LOCATIONS.filter(x => x.worldId === activeWorldId),  [activeWorldId]);
  const lore       = useMemo(() => WORLD_LORE.filter(x => x.worldId === activeWorldId),       [activeWorldId]);
  const bestiary   = useMemo(() => WORLD_BESTIARY.filter(x => x.worldId === activeWorldId),   [activeWorldId]);
  const encounters = useMemo(() => WORLD_ENCOUNTERS.filter(x => x.worldId === activeWorldId), [activeWorldId]);
  const timeline   = useMemo(() => WORLD_TIMELINE.filter(x => x.worldId === activeWorldId),   [activeWorldId]);

  const value = useMemo<WorldContextType>(() => ({
    worlds,
    activeWorldId,
    setActiveWorldId,
    activeWorld,
    loading,
    createWorld,
    updateWorld,
    deleteWorld,
    campaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    activeCampaignId,
    activeCampaign,
    openCampaign,
    backToWorld,
    worldTab,
    setWorldTab: handleSetWorldTab,
    npcs,
    factions,
    locations,
    lore,
    bestiary,
    encounters,
    timeline,
    timelineTypeConfig: TIMELINE_TYPE_CONFIG,
    eraConfig: ERA_CONFIG,
    npcById: WORLD_NPC_BY_ID,
    locById: WORLD_LOC_BY_ID,
    loreById: WORLD_LORE_BY_ID,
    facById: WORLD_FAC_BY_ID,
    sbById: WORLD_SB_BY_ID,
    selected,
    setSelected,
  }), [
    worlds, activeWorldId, setActiveWorldId, activeWorld, loading,
    createWorld, updateWorld, deleteWorld,
    campaigns, createCampaign, updateCampaign, deleteCampaign,
    activeCampaignId, activeCampaign, openCampaign, backToWorld,
    worldTab, handleSetWorldTab,
    npcs, factions, locations, lore, bestiary, encounters, timeline,
    selected, setSelected,
  ]);

  return (
    <WorldContext.Provider value={value}>
      {children}
    </WorldContext.Provider>
  );
}

export function useWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useWorld must be used within WorldProvider');
  return ctx;
}
