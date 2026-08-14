import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type {
  World, WorldCampaign, WorldTab,
  WorldNPC, WorldFaction, WorldLocation, WorldLoreEntry,
  WorldBestiaryEntry, WorldEncounter, WorldTimelineEvent,
} from '../types/world';
import {
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
  TimelineEvents as TimelineEventsDB,
} from '../lib/db';
import type {
  DbWorld, Campaign, CampaignWithCount,
  NPC, Faction, Location as DBLocation, LoreEntry, MonsterStatblock, MonsterStatblockInsert, Encounter,
  TimelineEvent as DBTimelineEvent,
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
    dmNotes: f.dm_notes ?? '',
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
    parent: l.parent_id ?? null,
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

function dbToWorldTimelineEvent(e: DBTimelineEvent): WorldTimelineEvent {
  return {
    id: e.id,
    worldId: e.world_id ?? '',
    title: e.title,
    desc: e.description ?? '',
    date: e.display_date,
    year: e.year,
    type: e.event_type as WorldTimelineEvent['type'],
    era: e.era,
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
  /** True while the active world's entities (NPCs, locations, lore, …) are being fetched. */
  entitiesLoading: boolean;

  /** Create a world; the optional `seed` inserts its starter entities before the
   *  world is activated, so its data loads in one pass rather than two. */
  createWorld: (name: string, tagline: string, seed?: (worldId: string) => Promise<void>) => Promise<World>;
  updateWorld: (id: string, changes: Partial<World>) => Promise<void>;
  deleteWorld: (id: string) => Promise<void>;
  /** Re-fetch the active world's entities — call after seeding a freshly-created world. */
  reloadWorldEntities: () => void;

  campaigns: WorldCampaign[];
  createCampaign: (name: string, fields?: { party?: string; plot_summary?: string }) => Promise<WorldCampaign>;
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
  createLoreEntry: () => Promise<string | null>;
  upsertWorldLore: (data: Partial<LoreEntry> & { id: string }) => Promise<void>;
  deleteWorldLore: (id: string) => Promise<void>;
  createLocation: () => Promise<string | null>;
  upsertWorldLocation: (data: Partial<DBLocation> & { id: string }) => Promise<void>;
  deleteWorldLocation: (id: string) => Promise<void>;
  createNPC: () => Promise<string | null>;
  upsertWorldNPC: (data: Partial<NPC> & { id: string }) => Promise<void>;
  deleteWorldNPC: (id: string) => Promise<void>;
  createFaction: () => Promise<string | null>;
  upsertWorldFaction: (data: Partial<Faction> & { id: string }) => Promise<void>;
  deleteWorldFaction: (id: string) => Promise<void>;
  createBestiaryEntry: () => Promise<string | null>;
  upsertWorldStatblock: (data: Omit<MonsterStatblockInsert, 'world_id' | 'campaign_id'> & { id?: string }) => Promise<MonsterStatblock>;
  deleteBestiaryEntry: (id: string) => Promise<void>;
  createEncounter: () => Promise<string | null>;
  deleteEncounter: (id: string) => Promise<void>;
  upsertWorldEncounter: (data: EncounterSaveData) => Promise<Encounter>;
  timeline: WorldTimelineEvent[];
  createTimelineEvent: (data: Omit<WorldTimelineEvent, 'id' | 'worldId'>) => Promise<string | null>;
  upsertTimelineEvent: (data: Partial<WorldTimelineEvent> & { id: string }) => Promise<void>;
  deleteTimelineEvent: (id: string) => Promise<void>;
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
  const [timeline, setTimeline] = useState<WorldTimelineEvent[]>([]);
  // Bumped by reloadWorldEntities() to force a re-fetch of the active world's
  // entities — used after the first-world gate seeds a freshly-created world.
  const [entityReloadKey, setEntityReloadKey] = useState(0);
  // True while the active world's entities are being fetched — start true so the
  // world view shows a loader on mount rather than a flash of empty content.
  const [entitiesLoading, setEntitiesLoading] = useState(true);

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
      setRawStatblocks([]); setRawEncounters([]); setTimeline([]);
      setEntitiesLoading(false);
      return;
    }
    let cancelled = false;
    setEntitiesLoading(true);
    async function loadEntities() {
      try {
        const [dbNpcs, dbFactions, dbLocations, dbLore, dbBestiary, dbEncounters, dbTimeline] = await Promise.all([
          NPCsDB.getByWorld(activeWorldId),
          FactionsDB.getByWorld(activeWorldId),
          LocationsDB.getByWorld(activeWorldId),
          LoreDB.getByWorld(activeWorldId),
          MonsterStatblocksDB.getByWorld(activeWorldId),
          EncountersDB.getByWorld(activeWorldId),
          TimelineEventsDB.getByWorld(activeWorldId),
        ]);
        if (cancelled) return;
        setNpcs(dbNpcs.map(dbNPCToWorldNPC));
        setFactions(dbFactions.map(dbFactionToWorldFaction));
        setLocations(dbLocations.map(dbLocationToWorldLocation));
        setLore(dbLore.map(dbLoreToWorldLore));
        setRawStatblocks(dbBestiary);
        setRawEncounters(dbEncounters);
        setTimeline(dbTimeline.map(dbToWorldTimelineEvent));
      } catch (e) {
        console.error('WorldContext: failed to load world entities', e);
      } finally {
        // A superseded run leaves entitiesLoading true; the newer run (which set
        // it true again) owns clearing it, so the flag tracks the latest world.
        if (!cancelled) setEntitiesLoading(false);
      }
    }
    loadEntities();
    return () => { cancelled = true; };
    // Re-runs on activeCampaignId too: a campaign can edit/publish shared canon
    // (its own WorldContext copy goes stale), so re-fetch when returning to world.
    // entityReloadKey lets callers (e.g. the first-world gate after seeding) force a re-fetch.
  }, [activeWorldId, activeCampaignId, entityReloadKey]);

  const reloadWorldEntities = useCallback(() => setEntityReloadKey(k => k + 1), []);

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

  const createWorld = useCallback(async (
    name: string,
    tagline: string,
    seed?: (worldId: string) => Promise<void>,
  ) => {
    const dbWorld = await WorldsDB.upsert({
      name,
      tagline: tagline || 'A new world awaits',
      era: 'First Age',
      calendar: 'Year (Y)',
      year: 1,
      sort_order: Math.floor(Date.now() / 1000),
    });
    const newWorld = dbToWorld(dbWorld, []);
    // Seed the world's entities BEFORE it becomes active, so the single entity
    // fetch triggered by setActiveWorldId already sees the full data set. Doing
    // it after would cause a create → empty → reload → full double-load flicker.
    if (seed) {
      try { await seed(newWorld.id); }
      catch (e) { console.error('createWorld: seeding failed', e); }
    }
    setWorlds(prev => [...prev, newWorld]);
    // Mark loading before activating so the world view shows the loader on the
    // very next render rather than a frame of empty content, then the fetch runs.
    setEntitiesLoading(true);
    setActiveWorldId(newWorld.id);
    setWorldTab('overview');
    setActiveCampaignId(null);
    return newWorld;
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
    await WorldsDB.delete(id);
    setWorlds(prev => {
      const next = prev.filter(w => w.id !== id);
      // Deleting the active world reselects the first remaining one; deleting the
      // last world clears the selection, which drops the user back onto the
      // first-world gate (worlds.length === 0) via WorldRoot.
      if (id === activeWorldId) setActiveWorldId(next[0]?.id ?? '');
      return next;
    });
    setAllCampaigns(prev => prev.filter(c => c.worldId !== id));
  }, [activeWorldId, setActiveWorldId]);

  const createCampaign = useCallback(async (
    name: string,
    fields?: { party?: string; plot_summary?: string },
  ): Promise<WorldCampaign> => {
    const dbCampaign = await CampaignsDB.upsert({
      world_id: activeWorldId,
      name,
      description: null,
      title: name, // the campaign Overview heading reads `title`, not `name`
      plot_summary: fields?.plot_summary ?? null,
      major_characters: null,
      world_info: null,
      party: fields?.party ?? '',
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
    return newCampaign;
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

  const createLoreEntry = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await LoreDB.upsert({
      title: '',
      world_id: activeWorldId,
      campaign_id: null,
      category: null,
      content: null,
      dm_only: false,
    });
    setLore(prev => [...prev, dbLoreToWorldLore(dbEntry)]);
    return dbEntry.id;
  }, [activeWorldId]);

  const createLocation = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await LocationsDB.upsert({
      name: '',
      world_id: activeWorldId,
      campaign_id: null,
      location_type: 'landmark',
      parent_id: null,
      region: null,
      population: null,
      status: null,
      description: null,
      history: null,
      dm_notes: null,
    });
    setLocations(prev => [...prev, dbLocationToWorldLocation(dbEntry)]);
    return dbEntry.id;
  }, [activeWorldId]);

  const createNPC = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await NPCsDB.upsert({
      name: '',
      world_id: activeWorldId,
      campaign_id: null,
      role: null,
      status: 'active',
      description: null,
      hooks_motivations: null,
      dm_notes: null,
      location: null,
      faction_ids: [],
      affiliation: null,
      first_session: null,
      met_by_pcs: false,
      statblock_id: null,
    });
    setNpcs(prev => [...prev, dbNPCToWorldNPC(dbEntry)]);
    return dbEntry.id;
  }, [activeWorldId]);

  const upsertWorldNPC = useCallback(async (
    data: Partial<NPC> & { id: string },
  ): Promise<void> => {
    const dbEntry = await NPCsDB.upsert({
      name: data.name ?? '',
      world_id: activeWorldId,
      campaign_id: null,
      role: data.role ?? null,
      status: data.status ?? 'active',
      description: data.description ?? null,
      hooks_motivations: null,
      dm_notes: data.dm_notes ?? null,
      location: data.location ?? null,
      faction_ids: data.faction_ids ?? [],
      affiliation: null,
      first_session: null,
      met_by_pcs: false,
      statblock_id: null,
      id: data.id,
    });
    setNpcs(prev => prev.map(n => n.id === dbEntry.id ? dbNPCToWorldNPC(dbEntry) : n));
  }, [activeWorldId]);

  const deleteWorldNPC = useCallback(async (id: string): Promise<void> => {
    await NPCsDB.delete(id);
    setNpcs(prev => prev.filter(n => n.id !== id));
  }, []);

  const createFaction = useCallback(async (): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await FactionsDB.upsert({
      name: '',
      world_id: activeWorldId,
      campaign_id: null,
      faction_type: null,
      overview: null,
      key_figures: null,
      agenda: null,
      dm_notes: null,
    });
    setFactions(prev => [...prev, dbFactionToWorldFaction(dbEntry)]);
    return dbEntry.id;
  }, [activeWorldId]);

  const upsertWorldFaction = useCallback(async (
    data: Partial<Faction> & { id: string },
  ): Promise<void> => {
    const dbEntry = await FactionsDB.upsert({
      name: data.name ?? '',
      world_id: activeWorldId,
      campaign_id: null,
      faction_type: data.faction_type ?? null,
      overview: data.overview ?? null,
      key_figures: data.key_figures ?? null,
      agenda: data.agenda ?? null,
      dm_notes: data.dm_notes ?? null,
      id: data.id,
    });
    setFactions(prev => prev.map(f => f.id === dbEntry.id ? dbFactionToWorldFaction(dbEntry) : f));
  }, [activeWorldId]);

  const deleteWorldFaction = useCallback(async (id: string): Promise<void> => {
    await FactionsDB.delete(id);
    setFactions(prev => prev.filter(f => f.id !== id));
  }, []);

  const upsertWorldLore = useCallback(async (
    data: Partial<LoreEntry> & { id: string },
  ): Promise<void> => {
    const dbEntry = await LoreDB.upsert({
      title: data.title ?? '',
      world_id: activeWorldId,
      campaign_id: null,
      category: data.category ?? null,
      content: data.content ?? null,
      dm_only: data.dm_only ?? false,
      id: data.id,
    });
    setLore(prev => prev.map(l => l.id === dbEntry.id ? dbLoreToWorldLore(dbEntry) : l));
  }, [activeWorldId]);

  const deleteWorldLore = useCallback(async (id: string): Promise<void> => {
    await LoreDB.delete(id);
    setLore(prev => prev.filter(l => l.id !== id));
  }, []);

  const upsertWorldLocation = useCallback(async (
    data: Partial<DBLocation> & { id: string },
  ): Promise<void> => {
    const dbEntry = await LocationsDB.upsert({
      name: data.name ?? '',
      world_id: activeWorldId,
      campaign_id: null,
      location_type: data.location_type ?? 'landmark',
      parent_id: data.parent_id ?? null,
      region: data.region ?? null,
      population: data.population ?? null,
      status: data.status ?? null,
      description: data.description ?? null,
      history: data.history ?? null,
      dm_notes: data.dm_notes ?? null,
      id: data.id,
    });
    setLocations(prev => prev.map(l => l.id === dbEntry.id ? dbLocationToWorldLocation(dbEntry) : l));
  }, [activeWorldId]);

  const deleteWorldLocation = useCallback(async (id: string): Promise<void> => {
    await LocationsDB.delete(id);
    setLocations(prev => prev.filter(l => l.id !== id));
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

  const createTimelineEvent = useCallback(async (data: Omit<WorldTimelineEvent, 'id' | 'worldId'>): Promise<string | null> => {
    if (!activeWorldId) return null;
    const dbEntry = await TimelineEventsDB.upsert({
      world_id: activeWorldId,
      title: data.title,
      description: data.desc || null,
      year: data.year,
      display_date: data.date,
      event_type: data.type,
      era: data.era,
      sort_order: data.year,
    });
    setTimeline(prev => [...prev, dbToWorldTimelineEvent(dbEntry)]);
    return dbEntry.id;
  }, [activeWorldId]);

  const upsertTimelineEvent = useCallback(async (data: Partial<WorldTimelineEvent> & { id: string }): Promise<void> => {
    const dbData: Partial<DBTimelineEvent> & { id: string } = { id: data.id };
    if (data.title !== undefined) dbData.title = data.title;
    if (data.desc !== undefined) dbData.description = data.desc;
    if (data.year !== undefined) dbData.year = data.year;
    if (data.date !== undefined) dbData.display_date = data.date;
    if (data.type !== undefined) dbData.event_type = data.type;
    if (data.era !== undefined) dbData.era = data.era;
    const dbEntry = await TimelineEventsDB.upsert({
      world_id: activeWorldId,
      title: dbData.title ?? '',
      description: dbData.description ?? null,
      year: dbData.year ?? 0,
      display_date: dbData.display_date ?? '',
      event_type: dbData.event_type ?? 'custom',
      era: dbData.era ?? '',
      sort_order: dbData.year ?? 0,
      id: data.id,
    });
    setTimeline(prev => prev.map(e => e.id === dbEntry.id ? dbToWorldTimelineEvent(dbEntry) : e));
  }, [activeWorldId]);

  const deleteTimelineEvent = useCallback(async (id: string): Promise<void> => {
    await TimelineEventsDB.delete(id);
    setTimeline(prev => prev.filter(e => e.id !== id));
  }, []);

  const value = useMemo<WorldContextType>(() => ({
    worlds,
    activeWorldId,
    setActiveWorldId,
    activeWorld,
    loading,
    entitiesLoading,
    createWorld,
    updateWorld,
    deleteWorld,
    reloadWorldEntities,
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
    createTimelineEvent,
    upsertTimelineEvent,
    deleteTimelineEvent,
    createLoreEntry,
    upsertWorldLore,
    deleteWorldLore,
    createLocation,
    upsertWorldLocation,
    deleteWorldLocation,
    createNPC,
    upsertWorldNPC,
    deleteWorldNPC,
    createFaction,
    upsertWorldFaction,
    deleteWorldFaction,
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
    worlds, activeWorldId, setActiveWorldId, activeWorld, loading, entitiesLoading,
    createWorld, updateWorld, deleteWorld, reloadWorldEntities,
    campaigns, createCampaign, updateCampaign, deleteCampaign,
    activeCampaignId, activeCampaign, openCampaign, backToWorld,
    worldTab, handleSetWorldTab,
    npcs, factions, locations, lore, bestiary, encounters,
    rawStatblocks, rawEncounters, timeline,
    createTimelineEvent, upsertTimelineEvent, deleteTimelineEvent,
    createLoreEntry, upsertWorldLore, deleteWorldLore,
    createLocation, upsertWorldLocation, deleteWorldLocation,
    createNPC, upsertWorldNPC, deleteWorldNPC,
    createFaction, upsertWorldFaction, deleteWorldFaction,
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
