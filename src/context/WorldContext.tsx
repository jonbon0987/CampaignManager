import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type {
  World, WorldCampaign, WorldTab,
  WorldNPC, WorldFaction, WorldLocation, WorldLoreEntry,
  WorldBestiaryEntry, WorldEncounter, WorldTimelineEvent,
} from '../types/world';
import {
  WORLD_TIMELINE,
  TIMELINE_TYPE_CONFIG, ERA_CONFIG,
} from '../data/worldMockData';
import {
  Worlds as WorldsDB,
  Campaigns as CampaignsDB,
  NPCs as NPCsDB,
  Factions as FactionsDB,
  Locations as LocationsDB,
  Lore as LoreDB,
  MonsterStatblocks as MonsterStatblocksDB,
  Encounters as EncountersDB,
} from '../lib/db';
import type {
  DbWorld, Campaign, CampaignWithCount,
  NPC, Faction, Location as DBLocation, LoreEntry, MonsterStatblock, MonsterStatblockInsert, Encounter,
} from '../lib/database.types';
import type { EncounterSaveData } from '../components/ui/EncounterDetail';
import useLocalStorage from '../hooks/useLocalStorage';

// --------------- Mappers: DB → World types ---------------

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

function dbToWorldCampaign(c: CampaignWithCount | Campaign): WorldCampaign {
  return {
    id: c.id,
    worldId: c.world_id ?? '',
    name: c.name,
    sessions: (c as CampaignWithCount).session_count ?? 0,
    party: c.party ?? '',
    lastPlayed: c.last_played ?? '',
    status: c.status ?? 'active',
  };
}

function dbNPCToWorldNPC(n: NPC): WorldNPC {
  return {
    id: n.id,
    worldId: n.world_id ?? '',
    name: n.name,
    role: n.role ?? '',
    status: n.status as WorldNPC['status'],
    desc: n.description ?? '',
    factions: n.faction_ids ?? [],
    location: n.location,
    era: '',
    tags: [],
  };
}

function dbFactionToWorldFaction(f: Faction): WorldFaction {
  return {
    id: f.id,
    worldId: f.world_id ?? '',
    name: f.name,
    type: f.faction_type ?? '',
    tone: '',
    desc: f.overview ?? '',
  };
}

function dbLocationToWorldLocation(l: DBLocation): WorldLocation {
  return {
    id: l.id,
    worldId: l.world_id ?? '',
    name: l.name,
    type: l.location_type ?? '',
    desc: l.description ?? '',
    tags: [],
    parent: null,
  };
}

function dbLoreToWorldLore(e: LoreEntry): WorldLoreEntry {
  return {
    id: e.id,
    worldId: e.world_id ?? '',
    title: e.title,
    desc: e.content ?? '',
    tags: e.category ? [e.category] : [],
  };
}

function dbStatblockToWorldBestiary(s: MonsterStatblock): WorldBestiaryEntry {
  let tags: string[] = [];
  if (s.tags) {
    try { tags = JSON.parse(s.tags); }
    catch { tags = s.tags.split(',').map(t => t.trim()).filter(Boolean); }
  }
  return {
    id: s.id,
    worldId: s.world_id ?? '',
    name: s.name,
    cr: s.challenge_rating ?? '',
    type: s.creature_type ?? '',
    hp: s.hit_points ?? 0,
    ac: s.armor_class ?? 0,
    desc: s.content ?? '',
    tags,
  };
}

function dbEncounterToWorldEncounter(e: Encounter): WorldEncounter {
  let creatures: string[] = [];
  if (e.combatants) {
    try {
      const parsed = JSON.parse(e.combatants) as Array<{ statblock_id?: string | null }>;
      creatures = parsed.map(c => c.statblock_id).filter(Boolean) as string[];
    } catch { /* malformed JSON — ignore */ }
  }
  return {
    id: e.id,
    worldId: e.world_id ?? '',
    name: e.name,
    difficulty: e.difficulty ?? 'medium',
    status: e.status,
    creatures,
    notes: e.dm_notes ?? '',
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

  // Navigation
  activeCampaignId: string | null;
  activeCampaign: WorldCampaign | null;
  openCampaign: (id: string) => void;
  backToWorld: () => void;

  // World tab
  worldTab: WorldTab;
  setWorldTab: (tab: WorldTab) => void;

  // World entities (DB-backed)
  npcs: WorldNPC[];
  factions: WorldFaction[];
  locations: WorldLocation[];
  lore: WorldLoreEntry[];
  bestiary: WorldBestiaryEntry[];
  encounters: WorldEncounter[];
  // Raw DB records — needed by EncounterDetail which expects Encounter / MonsterStatblock directly
  worldStatblocks: MonsterStatblock[];
  worldEncounters: Encounter[];
  createBestiaryEntry: () => Promise<string | null>;
  upsertWorldStatblock: (data: Omit<MonsterStatblockInsert, 'world_id' | 'campaign_id'> & { id?: string }) => Promise<MonsterStatblock>;
  deleteBestiaryEntry: (id: string) => Promise<void>;
  createEncounter: () => Promise<string | null>;
  deleteEncounter: (id: string) => Promise<void>;
  upsertWorldEncounter: (data: EncounterSaveData) => Promise<Encounter>;
  timeline: WorldTimelineEvent[];
  timelineTypeConfig: typeof TIMELINE_TYPE_CONFIG;
  eraConfig: typeof ERA_CONFIG;

  // Lookup maps (derived from fetched data)
  npcById: Record<string, WorldNPC>;
  locById: Record<string, WorldLocation>;
  loreById: Record<string, WorldLoreEntry>;
  facById: Record<string, WorldFaction>;
  sbById: Record<string, WorldBestiaryEntry>;

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
  const [selected, setSelectedState] = useState<Record<string, string>>({});

  // World entity state (DB-backed)
  const [npcs, setNpcs] = useState<WorldNPC[]>([]);
  const [factions, setFactions] = useState<WorldFaction[]>([]);
  const [locations, setLocations] = useState<WorldLocation[]>([]);
  const [lore, setLore] = useState<WorldLoreEntry[]>([]);
  // Raw DB records — source of truth; mapped types are derived below
  const [rawStatblocks, setRawStatblocks] = useState<MonsterStatblock[]>([]);
  const [rawEncounters, setRawEncounters] = useState<Encounter[]>([]);

  // Load worlds and campaigns on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dbWorlds, dbCampaigns] = await Promise.all([
          WorldsDB.getAll(),
          CampaignsDB.getAll(),
        ]);
        if (cancelled) return;

        const mapped: World[] = dbWorlds.map(w => dbToWorld(
          w,
          dbCampaigns.filter(c => c.world_id === w.id).map(c => c.id),
        ));
        setWorlds(mapped);
        setAllCampaigns(dbCampaigns.map(dbToWorldCampaign));

        setActiveWorldId(prev =>
          mapped.length === 0 ? '' :
          mapped.some(w => w.id === prev) ? prev : mapped[0].id
        );
      } catch (e) {
        console.error('WorldContext: failed to load worlds', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load world entities whenever the active world changes
  useEffect(() => {
    if (!activeWorldId) {
      setNpcs([]); setFactions([]); setLocations([]); setLore([]);
      setRawStatblocks([]); setRawEncounters([]);
      return;
    }
    let cancelled = false;
    async function loadEntities() {
      try {
        const [dbNpcs, dbFactions, dbLocations, dbLore, dbBestiary, dbEncounters] = await Promise.all([
          NPCsDB.getByWorld(activeWorldId),
          FactionsDB.getByWorld(activeWorldId),
          LocationsDB.getByWorld(activeWorldId),
          LoreDB.getByWorld(activeWorldId),
          MonsterStatblocksDB.getByWorld(activeWorldId),
          EncountersDB.getByWorld(activeWorldId),
        ]);
        if (cancelled) return;
        setNpcs(dbNpcs.map(dbNPCToWorldNPC));
        setFactions(dbFactions.map(dbFactionToWorldFaction));
        setLocations(dbLocations.map(dbLocationToWorldLocation));
        setLore(dbLore.map(dbLoreToWorldLore));
        setRawStatblocks(dbBestiary);
        setRawEncounters(dbEncounters);
      } catch (e) {
        console.error('WorldContext: failed to load world entities', e);
      }
    }
    loadEntities();
    return () => { cancelled = true; };
  }, [activeWorldId]);

  const activeWorld = useMemo(
    () => worlds.find(w => w.id === activeWorldId) ?? null,
    [activeWorldId, worlds],
  );

  // Derived mapped types from raw DB records
  const bestiary  = useMemo(() => rawStatblocks.map(dbStatblockToWorldBestiary), [rawStatblocks]);
  const encounters = useMemo(() => rawEncounters.map(dbEncounterToWorldEncounter), [rawEncounters]);

  // Lookup maps derived from fetched data
  const npcById  = useMemo(() => Object.fromEntries(npcs.map(n => [n.id, n])),      [npcs]);
  const locById  = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations]);
  const loreById = useMemo(() => Object.fromEntries(lore.map(e => [e.id, e])),      [lore]);
  const facById  = useMemo(() => Object.fromEntries(factions.map(f => [f.id, f])),  [factions]);
  const sbById   = useMemo(() => Object.fromEntries(bestiary.map(b => [b.id, b])),  [bestiary]);

  // Timeline has no world-level DB table yet — kept as empty
  const timeline = useMemo(() => WORLD_TIMELINE.filter(() => false), []);

  const createWorld = useCallback(async (name: string, tagline: string) => {
    const dbWorld = await WorldsDB.upsert({
      name,
      tagline: tagline || 'A new world awaits',
      era: 'First Age',
      calendar: 'Year (Y)',
      year: 1,
      sort_order: Math.floor(Date.now() / 1000),
    });
    const newWorld = dbToWorld(dbWorld, []);
    setWorlds(prev => [...prev, newWorld]);
    setActiveWorldId(newWorld.id);
    setWorldTab('overview');
    setActiveCampaignId(null);
  }, [setActiveWorldId]);

  const updateWorld = useCallback(async (id: string, changes: Partial<World>) => {
    setWorlds(prev => prev.map(w => w.id === id ? { ...w, ...changes } : w));
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
    if (worlds.length <= 1) return;
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
      sort_order: Math.floor(Date.now() / 1000),
    });
    const newCampaign = dbToWorldCampaign(dbCampaign);
    setAllCampaigns(prev => [...prev, newCampaign]);
    setWorlds(prev => prev.map(w =>
      w.id === activeWorldId
        ? { ...w, campaignIds: [...w.campaignIds, newCampaign.id] }
        : w
    ));
  }, [activeWorldId]);

  const updateCampaign = useCallback(async (id: string, changes: Partial<WorldCampaign>) => {
    setAllCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
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

  const openCampaign  = useCallback((id: string) => setActiveCampaignId(id), []);
  const backToWorld   = useCallback(() => setActiveCampaignId(null), []);

  const handleSetWorldTab = useCallback((tab: WorldTab) => {
    setActiveCampaignId(null);
    setWorldTab(tab);
  }, []);

  const setSelected = useCallback((tab: string, id: string) => {
    setSelectedState(prev => ({ ...prev, [tab]: id }));
  }, []);

  const createBestiaryEntry = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await MonsterStatblocksDB.upsert({
      name: 'New Creature',
      world_id: activeWorldId,
      campaign_id: null,
      creature_type: 'beast',
      challenge_rating: '1',
      hit_points: 10,
      armor_class: 10,
      ac_descriptor: null,
      hit_dice: null,
      speed: null,
      str: null, dex: null, con: null, int: null, wis: null, cha: null,
      saving_throws: null,
      skills: null,
      damage_resistances: null,
      damage_immunities: null,
      condition_immunities: null,
      senses: null,
      languages: null,
      content: null,
      dm_notes: null,
      tags: null,
      sort_order: Math.floor(Date.now() / 1000),
    });
    setRawStatblocks(prev => [...prev, dbEntry]);
    return dbEntry.id;
  }, [activeWorldId]);

  const upsertWorldStatblock = useCallback(async (
    data: Omit<MonsterStatblockInsert, 'world_id' | 'campaign_id'> & { id?: string },
  ): Promise<MonsterStatblock> => {
    const dbEntry = await MonsterStatblocksDB.upsert({
      ...data,
      world_id: activeWorldId,
      campaign_id: null,
    });
    setRawStatblocks(prev => {
      const idx = prev.findIndex(s => s.id === dbEntry.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = dbEntry;
        return next;
      }
      return [...prev, dbEntry];
    });
    return dbEntry;
  }, [activeWorldId]);

  const deleteBestiaryEntry = useCallback(async (id: string): Promise<void> => {
    await MonsterStatblocksDB.delete(id);
    setRawStatblocks(prev => prev.filter(b => b.id !== id));
  }, []);

  const createEncounter = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEncounter = await EncountersDB.upsert({
      name: 'New Encounter',
      campaign_id: null,
      world_id: activeWorldId,
      description: null,
      environment: null,
      difficulty: 'medium',
      party_size: null,
      party_level: null,
      combatants: '[]',
      dm_notes: null,
      status: 'draft',
      sort_order: Math.floor(Date.now() / 1000),
    });
    setRawEncounters(prev => [...prev, dbEncounter]);
    return dbEncounter.id;
  }, [activeWorldId]);

  const deleteEncounter = useCallback(async (id: string): Promise<void> => {
    await EncountersDB.delete(id);
    setRawEncounters(prev => prev.filter(e => e.id !== id));
  }, []);

  const upsertWorldEncounter = useCallback(async (data: EncounterSaveData): Promise<Encounter> => {
    const dbEncounter = await EncountersDB.upsert({
      ...data,
      campaign_id: null,
      world_id: activeWorldId,
    });
    setRawEncounters(prev => {
      const idx = prev.findIndex(e => e.id === dbEncounter.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = dbEncounter;
        return next;
      }
      return [...prev, dbEncounter];
    });
    return dbEncounter;
  }, [activeWorldId]);

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
    worldStatblocks: rawStatblocks,
    worldEncounters: rawEncounters,
    timeline,
    createBestiaryEntry,
    upsertWorldStatblock,
    deleteBestiaryEntry,
    createEncounter,
    deleteEncounter,
    upsertWorldEncounter,
    timelineTypeConfig: TIMELINE_TYPE_CONFIG,
    eraConfig: ERA_CONFIG,
    npcById,
    locById,
    loreById,
    facById,
    sbById,
    selected,
    setSelected,
  }), [
    worlds, activeWorldId, setActiveWorldId, activeWorld, loading,
    createWorld, updateWorld, deleteWorld,
    campaigns, createCampaign, updateCampaign, deleteCampaign,
    activeCampaignId, activeCampaign, openCampaign, backToWorld,
    worldTab, handleSetWorldTab,
    npcs, factions, locations, lore, bestiary, encounters,
    rawStatblocks, rawEncounters, timeline,
    createBestiaryEntry, upsertWorldStatblock, deleteBestiaryEntry, createEncounter, deleteEncounter, upsertWorldEncounter,
    npcById, locById, loreById, facById, sbById,
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
