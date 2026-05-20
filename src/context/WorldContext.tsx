import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { World, WorldCampaign, WorldTab } from '../types/world';
import {
  WORLDS, WORLD_CAMPAIGNS, WORLD_NPCS, WORLD_FACTIONS, WORLD_LOCATIONS,
  WORLD_LORE, WORLD_BESTIARY, WORLD_ENCOUNTERS, WORLD_TIMELINE,
  TIMELINE_TYPE_CONFIG, ERA_CONFIG,
  WORLD_BY_ID, WORLD_NPC_BY_ID, WORLD_LOC_BY_ID, WORLD_LORE_BY_ID,
  WORLD_FAC_BY_ID, WORLD_SB_BY_ID,
} from '../data/worldMockData';
import useLocalStorage from '../hooks/useLocalStorage';

interface WorldContextType {
  // World selection
  worlds: World[];
  activeWorldId: string;
  setActiveWorldId: (id: string) => void;
  activeWorld: World;
  createWorld: (name: string, tagline: string) => void;
  updateWorld: (id: string, changes: Partial<World>) => void;
  campaigns: WorldCampaign[];
  updateCampaign: (id: string, changes: Partial<WorldCampaign>) => void;

  // Navigation mode
  activeCampaignId: string | null;
  activeCampaign: WorldCampaign | null;
  openCampaign: (id: string) => void;
  backToWorld: () => void;

  // World tab
  worldTab: WorldTab;
  setWorldTab: (tab: WorldTab) => void;

  // World data
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
  const [worlds, setWorlds] = useState<World[]>(() => [...WORLDS]);
  const [allCampaigns, setAllCampaigns] = useState<WorldCampaign[]>(() => [...WORLD_CAMPAIGNS]);
  const [activeWorldId, setActiveWorldId] = useLocalStorage('dnd-active-world', 'w1');
  const [worldTab, setWorldTab] = useState<WorldTab>('overview');
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [selected, setSelectedState] = useState<Record<string, string>>({
    npcs: 'wn1',
    locations: 'wl-velden',
    lore: 'wlr-1',
    combat: 'wsb-1',
  });

  const activeWorld = useMemo(
    () => worlds.find(w => w.id === activeWorldId) ?? worlds[0],
    [activeWorldId, worlds],
  );

  const createWorld = useCallback((name: string, tagline: string) => {
    const newWorld: World = {
      id: `w-${Date.now()}`,
      name,
      tagline: tagline || 'A new world awaits',
      era: 'First Age',
      calendar: 'Year (Y)',
      year: 1,
      campaignIds: [],
    };
    setWorlds(prev => [...prev, newWorld]);
    setActiveWorldId(newWorld.id);
    setWorldTab('overview');
    setActiveCampaignId(null);
  }, [setActiveWorldId]);

  const updateWorld = useCallback((id: string, changes: Partial<World>) => {
    setWorlds(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));
  }, []);

  const updateCampaign = useCallback((id: string, changes: Partial<WorldCampaign>) => {
    setAllCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
  }, []);

  const campaigns = useMemo(
    () => allCampaigns.filter(c => c.worldId === activeWorldId),
    [activeWorldId, allCampaigns],
  );

  const activeCampaign = useMemo(
    () => activeCampaignId ? campaigns.find(c => c.id === activeCampaignId) ?? null : null,
    [activeCampaignId, campaigns],
  );

  const openCampaign = useCallback((id: string) => {
    setActiveCampaignId(id);
  }, []);

  const backToWorld = useCallback(() => {
    setActiveCampaignId(null);
  }, []);

  const handleSetWorldTab = useCallback((tab: WorldTab) => {
    setActiveCampaignId(null);
    setWorldTab(tab);
  }, []);

  const setSelected = useCallback((tab: string, id: string) => {
    setSelectedState(prev => ({ ...prev, [tab]: id }));
  }, []);

  const value = useMemo<WorldContextType>(() => ({
    worlds,
    activeWorldId,
    setActiveWorldId,
    activeWorld,
    createWorld,
    updateWorld,
    campaigns,
    updateCampaign,
    activeCampaignId,
    activeCampaign,
    openCampaign,
    backToWorld,
    worldTab,
    setWorldTab: handleSetWorldTab,
    npcs: WORLD_NPCS,
    factions: WORLD_FACTIONS,
    locations: WORLD_LOCATIONS,
    lore: WORLD_LORE,
    bestiary: WORLD_BESTIARY,
    encounters: WORLD_ENCOUNTERS,
    timeline: WORLD_TIMELINE,
    timelineTypeConfig: TIMELINE_TYPE_CONFIG,
    eraConfig: ERA_CONFIG,
    npcById: WORLD_NPC_BY_ID,
    locById: WORLD_LOC_BY_ID,
    loreById: WORLD_LORE_BY_ID,
    facById: WORLD_FAC_BY_ID,
    sbById: WORLD_SB_BY_ID,
    selected,
    setSelected,
  }), [worlds, activeWorldId, setActiveWorldId, activeWorld, createWorld, updateWorld, campaigns, updateCampaign, activeCampaignId, activeCampaign, openCampaign, backToWorld, worldTab, handleSetWorldTab, selected, setSelected]);

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
