import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { useLinkableGlobals } from '../hooks/useLinkableGlobals';
import { useToast } from './ToastContext';
import type { CampaignOverview } from '../types';
import { errorMessage } from '../lib/errors';
import {
  Campaigns as CampaignsDB,
  CampaignNPCs as CampaignNPCsDB,
  CampaignLocations as CampaignLocationsDB,
  Sessions as SessionsDB,
  SessionPreps as SessionPrepsDB,
  PlayerCharacters as PlayerCharactersDB,
  NPCs as NPCsDB,
  Locations as LocationsDB,
  Factions as FactionsDB,
  Hooks as HooksDB,
  Lore as LoreDB,
  Modules as ModulesDB,
  Relationships as RelationshipsDB,
  Submodules as SubmodulesDB,
  Scenes as ScenesDB,
  ModuleSheets as ModuleSheetsDB,
  MonsterStatblocks as MonsterStatblocksDB,
  Encounters as EncountersDB,
  ModuleDeps as ModuleDepsDB,
  SubmoduleDeps as SubmoduleDepsDB,
} from '../lib/db';
import type {
  Campaign, CampaignInsert,
  Session, SessionInsert,
  SessionPrep, SessionPrepInsert,
  PlayerCharacter, PlayerCharacterInsert,
  NPC, NPCInsert,
  Location, LocationInsert,
  Faction, FactionInsert,
  Hook, HookInsert,
  LoreEntry, LoreEntryInsert,
  Module, ModuleInsert,
  CharacterRelationship, CharacterRelationshipInsert,
  Submodule, SubmoduleInsert,
  Scene, SceneInsert,
  ModuleSheet, ModuleSheetInsert,
  MonsterStatblock, MonsterStatblockInsert,
  Encounter, EncounterInsert,
  ModuleDependency, ModuleDependencyInsert,
  SubmoduleDependency, SubmoduleDependencyInsert,
} from '../lib/database.types';

interface CampaignContextType {
  // Campaign management
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  selectedCampaign: Campaign | null;
  createCampaign: (name: string, description?: string) => Promise<Campaign>;
  updateCampaign: (id: string, data: Partial<CampaignInsert>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  switchCampaign: (id: string) => void;

  // Campaign overview (derived from selectedCampaign, stored in DB)
  overview: CampaignOverview;
  setOverview: (o: CampaignOverview | ((prev: CampaignOverview) => CampaignOverview)) => void;

  // DB-backed entities
  sessions: Session[];
  pcs: PlayerCharacter[];
  // npcs = campaign-specific + linked global NPCs (for backwards-compatible consumers)
  npcs: NPC[];
  globalNPCs: NPC[];          // global pool (campaign_id IS NULL)
  linkedNPCIds: string[];     // IDs of global NPCs linked to current campaign
  // locations = campaign-specific + linked global locations
  locations: Location[];
  globalLocations: Location[];
  linkedLocationIds: string[];
  factions: Faction[];
  hooks: Hook[];
  lore: LoreEntry[];
  modules: Module[];
  relationships: CharacterRelationship[];

  loading: boolean;
  error: string | null;

  // Sessions
  upsertSession: (s: Omit<SessionInsert, 'campaign_id'> & { id?: string }) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;

  // Player Characters
  upsertPC: (pc: Omit<PlayerCharacterInsert, 'campaign_id'> & { id?: string }) => Promise<PlayerCharacter>;
  deletePC: (id: string) => Promise<void>;

  // NPCs — scope: 'campaign' creates campaign-specific, 'global' creates in global pool
  upsertNPC: (npc: Omit<NPCInsert, 'campaign_id'> & { id?: string }, scope?: 'campaign' | 'global') => Promise<NPC>;
  deleteNPC: (id: string) => Promise<void>;
  linkNPCToCampaign: (npcId: string) => Promise<void>;
  unlinkNPCFromCampaign: (npcId: string) => Promise<void>;

  // Locations
  upsertLocation: (loc: Omit<LocationInsert, 'campaign_id'> & { id?: string }, scope?: 'campaign' | 'global') => Promise<Location>;
  deleteLocation: (id: string) => Promise<void>;
  linkLocationToCampaign: (locationId: string) => Promise<void>;
  unlinkLocationFromCampaign: (locationId: string) => Promise<void>;

  // Factions
  upsertFaction: (f: Omit<FactionInsert, 'campaign_id'> & { id?: string }) => Promise<Faction>;
  deleteFaction: (id: string) => Promise<void>;

  // Hooks / ideas
  upsertHook: (h: Omit<HookInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteHook: (id: string) => Promise<void>;

  // Lore entries (global)
  upsertLore: (e: LoreEntryInsert & { id?: string }) => Promise<LoreEntry>;
  deleteLore: (id: string) => Promise<void>;

  // Modules
  upsertModule: (m: Omit<ModuleInsert, 'campaign_id'> & { id?: string }) => Promise<Module | undefined>;
  deleteModule: (id: string) => Promise<void>;

  // Character relationships
  upsertRelationship: (r: Omit<CharacterRelationshipInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteRelationship: (id: string) => Promise<void>;

  // Submodules
  submodules: Submodule[];
  loadSubmodules: (moduleId: string) => Promise<void>;
  upsertSubmodule: (s: SubmoduleInsert & { id?: string }) => Promise<void>;
  deleteSubmodule: (id: string, moduleId: string) => Promise<void>;

  // Scenes
  scenes: Scene[];
  loadScenes: (submoduleId: string) => Promise<void>;
  upsertScene: (s: SceneInsert & { id?: string }) => Promise<void>;
  deleteScene: (id: string, submoduleId: string) => Promise<void>;

  // Module Sheets
  moduleSheets: ModuleSheet[];
  loadModuleSheets: (moduleId: string) => Promise<void>;
  upsertModuleSheet: (s: ModuleSheetInsert & { id?: string }) => Promise<void>;
  deleteModuleSheet: (id: string, moduleId: string) => Promise<void>;

  // Monster Statblocks
  monsterStatblocks: MonsterStatblock[];
  upsertMonsterStatblock: (m: Omit<MonsterStatblockInsert, 'campaign_id'> & { id?: string }) => Promise<MonsterStatblock>;
  deleteMonsterStatblock: (id: string) => Promise<void>;

  // Encounters
  encounters: Encounter[];
  upsertEncounter: (e: Omit<EncounterInsert, 'campaign_id'> & { id?: string }) => Promise<Encounter>;
  deleteEncounter: (id: string) => Promise<void>;

  // Session Prep
  sessionPreps: SessionPrep[];
  upsertSessionPrep: (p: Omit<SessionPrepInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteSessionPrep: (id: string) => Promise<void>;

  // Module Dependencies
  moduleDeps: ModuleDependency[];
  loadModuleDeps: (campaignId: string) => Promise<void>;
  upsertModuleDep: (dep: ModuleDependencyInsert & { id?: string }) => Promise<void>;
  deleteModuleDep: (id: string) => Promise<void>;

  // Submodule Dependencies
  submoduleDeps: SubmoduleDependency[];
  loadSubmoduleDeps: (moduleId: string) => Promise<void>;
  upsertSubmoduleDep: (dep: SubmoduleDependencyInsert & { id?: string }) => Promise<void>;
  deleteSubmoduleDep: (id: string) => Promise<void>;
}

const CampaignContext = createContext<CampaignContextType | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  /** Wrap an async mutation with error toast. Re-throws so callers can still catch. */
  const withToast = useCallback(<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    successMsg?: string,
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        const result = await fn(...args);
        if (successMsg) toast(successMsg, 'success');
        return result;
      } catch (err) {
        toast(errorMessage(err), 'error');
        throw err;
      }
    };
  }, [toast]);

  // Campaign list + selected campaign (persisted in localStorage)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useLocalStorage<string | null>('dnd-selected-campaign-id', null);

  // Campaign-scoped entities
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pcs, setPCs] = useState<PlayerCharacter[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([]);
  const [submodules, setSubmodules] = useState<Submodule[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [moduleSheets, setModuleSheets] = useState<ModuleSheet[]>([]);
  const [monsterStatblocks, setMonsterStatblocks] = useState<MonsterStatblock[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [sessionPreps, setSessionPreps] = useState<SessionPrep[]>([]);
  const [moduleDeps, setModuleDeps] = useState<ModuleDependency[]>([]);
  const [submoduleDeps, setSubmoduleDeps] = useState<SubmoduleDependency[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // NPCs and Locations share the "linkable globals" pattern: campaign-specific
  // rows + a global pool that campaigns opt into. One generic hook backs both.
  const npcStore = useLinkableGlobals<NPC, NPCInsert>({
    getByCampaign: NPCsDB.getByCampaign,
    getGlobal: NPCsDB.getGlobal,
    getLinkedIds: CampaignNPCsDB.getLinkedNPCIds,
    upsert: NPCsDB.upsert,
    remove: NPCsDB.delete,
    link: CampaignNPCsDB.link,
    unlink: CampaignNPCsDB.unlink,
  }, selectedCampaignId);

  const locationStore = useLinkableGlobals<Location, LocationInsert>({
    getByCampaign: LocationsDB.getByCampaign,
    getGlobal: LocationsDB.getGlobal,
    getLinkedIds: CampaignLocationsDB.getLinkedLocationIds,
    upsert: LocationsDB.upsert,
    remove: LocationsDB.delete,
    link: CampaignLocationsDB.link,
    unlink: CampaignLocationsDB.unlink,
  }, selectedCampaignId);

  // Stable refresh fns (used in loadAll's dependency array)
  const refreshNPCStore = npcStore.refresh;
  const refreshLocationStore = locationStore.refresh;

  // Merged arrays for backwards-compatible consumers: campaign-specific + linked global
  const npcs = npcStore.items;
  const globalNPCs = npcStore.globalItems;
  const linkedNPCIds = npcStore.linkedIds;
  const locations = locationStore.items;
  const globalLocations = locationStore.globalItems;
  const linkedLocationIds = locationStore.linkedIds;

  // Overview derived from the selected campaign (null-safe)
  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const overview: CampaignOverview = useMemo(() => ({
    title: selectedCampaign?.title ?? '',
    plotSummary: selectedCampaign?.plot_summary ?? '',
    majorCharacters: selectedCampaign?.major_characters ?? '',
    worldInfo: selectedCampaign?.world_info ?? '',
  }), [selectedCampaign]);

  // setOverview saves to the campaigns table
  const setOverview = useCallback(async (
    o: CampaignOverview | ((prev: CampaignOverview) => CampaignOverview)
  ) => {
    if (!selectedCampaignId || !selectedCampaign) return;
    const next = typeof o === 'function' ? o(overview) : o;
    await CampaignsDB.upsert({
      id: selectedCampaignId,
      name: next.title || selectedCampaign.name,
      description: selectedCampaign.description,
      sort_order: selectedCampaign.sort_order,
      title: next.title,
      plot_summary: next.plotSummary,
      major_characters: next.majorCharacters,
      world_info: next.worldInfo,
    });
    setCampaigns(await CampaignsDB.getAll());
  }, [selectedCampaignId, selectedCampaign, overview]);

  // Phase 1: load campaigns list
  const loadCampaigns = useCallback(async () => {
    try {
      const all = await CampaignsDB.getAll();
      setCampaigns(all);
      setSelectedCampaignId(prev => {
        if (prev && all.find(c => c.id === prev)) return prev;
        return all[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    }
  }, [setSelectedCampaignId]);

  // Phase 2: load all campaign-scoped data
  const loadAll = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, , , f, h, le, m, r] = await Promise.all([
        SessionsDB.getAll(campaignId),
        PlayerCharactersDB.getAll(campaignId),
        refreshNPCStore(campaignId),
        refreshLocationStore(campaignId),
        FactionsDB.getAll(campaignId),
        HooksDB.getAll(campaignId),
        LoreDB.getAll(),
        ModulesDB.getAll(campaignId),
        RelationshipsDB.getAll(campaignId),
      ]);
      setSessions(s);
      setPCs(p);
      setFactions(f);
      setHooks(h);
      setLore(le);
      setModules(m);
      setRelationships(r);
      // monster_statblocks and encounters require migrations to be run first
      try {
        setMonsterStatblocks(await MonsterStatblocksDB.getAll(campaignId));
      } catch {
        // table doesn't exist yet — silently ignore until migration is applied
      }
      try {
        setEncounters(await EncountersDB.getAll(campaignId));
      } catch {
        // table doesn't exist yet — silently ignore until migration is applied
      }
      try {
        setSessionPreps(await SessionPrepsDB.getAll(campaignId));
      } catch {
        // table doesn't exist yet — silently ignore until migration is applied
      }
      try {
        setModuleDeps(await ModuleDepsDB.getByCampaign(campaignId));
      } catch {
        // table doesn't exist yet — silently ignore until migration is applied
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [refreshNPCStore, refreshLocationStore]);

  // One-time migration: move localStorage overview to DB
  const migrateLocalStorageOverview = useCallback(async (campaignId: string, campaign: Campaign) => {
    const legacyKey = 'dnd-campaign-overview';
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CampaignOverview;
      if (!parsed.title && !parsed.plotSummary && !parsed.majorCharacters && !parsed.worldInfo) return;
      // Only migrate if the campaign has no overview data yet
      if (campaign.title || campaign.plot_summary || campaign.major_characters || campaign.world_info) return;
      await CampaignsDB.upsert({
        id: campaignId,
        name: campaign.name,
        description: campaign.description,
        sort_order: campaign.sort_order,
        title: parsed.title || null,
        plot_summary: parsed.plotSummary || null,
        major_characters: parsed.majorCharacters || null,
        world_info: parsed.worldInfo || null,
      });
      localStorage.removeItem(legacyKey);
      setCampaigns(await CampaignsDB.getAll());
    } catch {
      // migration failure is non-fatal
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadAll(selectedCampaignId);
  }, [selectedCampaignId, loadAll]);

  // Run localStorage migration after campaigns load and a campaign is selected
  useEffect(() => {
    if (!selectedCampaignId || campaigns.length === 0) return;
    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    if (campaign) migrateLocalStorageOverview(selectedCampaignId, campaign);
  }, [selectedCampaignId, campaigns, migrateLocalStorageOverview]);


  // ---- Campaign management ----
  const createCampaign = useCallback(async (name: string, description?: string): Promise<Campaign> => {
    const maxOrder = campaigns.reduce((max, c) => Math.max(max, c.sort_order), -1);
    const campaign = await CampaignsDB.upsert({ name, description: description ?? null, sort_order: maxOrder + 1, title: name, plot_summary: description ?? null, major_characters: null, world_info: null });
    const all = await CampaignsDB.getAll();
    setCampaigns(all);
    return campaign;
  }, [campaigns]);

  const updateCampaign = useCallback(async (id: string, data: Partial<CampaignInsert>) => {
    const existing = campaigns.find(c => c.id === id);
    if (!existing) return;
    await CampaignsDB.upsert({ id, name: existing.name, description: existing.description, sort_order: existing.sort_order, title: existing.title, plot_summary: existing.plot_summary, major_characters: existing.major_characters, world_info: existing.world_info, ...data });
    setCampaigns(await CampaignsDB.getAll());
  }, [campaigns]);

  const deleteCampaign = useCallback(async (id: string) => {
    await CampaignsDB.delete(id);
    const all = await CampaignsDB.getAll();
    setCampaigns(all);
    // If we deleted the selected campaign, switch to the first available
    if (id === selectedCampaignId) {
      setSelectedCampaignId(all[0]?.id ?? null);
    }
  }, [selectedCampaignId, setSelectedCampaignId]);

  const switchCampaign = useCallback((id: string) => {
    setSelectedCampaignId(id);
  }, [setSelectedCampaignId]);

  // ---- Sessions ----
  const upsertSession = useCallback(async (s: Omit<SessionInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return {} as Session;
    const result = await SessionsDB.upsert({ ...s, campaign_id: selectedCampaignId });
    setSessions(await SessionsDB.getAll(selectedCampaignId));
    return result;
  }, [selectedCampaignId]);

  const deleteSession = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await SessionsDB.delete(id);
    setSessions(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Player Characters ----
  const upsertPC = useCallback(async (pc: Omit<PlayerCharacterInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return {} as PlayerCharacter;
    const result = await PlayerCharactersDB.upsert({ ...pc, campaign_id: selectedCampaignId });
    setPCs(await PlayerCharactersDB.getAll(selectedCampaignId));
    return result;
  }, [selectedCampaignId]);

  const deletePC = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await PlayerCharactersDB.delete(id);
    setPCs(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- NPCs & Locations ----
  // Backed by the generic useLinkableGlobals stores declared above; these
  // aliases preserve the existing CampaignContext API surface.
  const upsertNPC = npcStore.upsert;
  const deleteNPC = npcStore.remove;
  const linkNPCToCampaign = npcStore.link;
  const unlinkNPCFromCampaign = npcStore.unlink;

  const upsertLocation = locationStore.upsert;
  const deleteLocation = locationStore.remove;
  const linkLocationToCampaign = locationStore.link;
  const unlinkLocationFromCampaign = locationStore.unlink;

  // ---- Factions ----
  const upsertFaction = useCallback(async (f: Omit<FactionInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return {} as Faction;
    const result = await FactionsDB.upsert({ ...f, campaign_id: selectedCampaignId });
    setFactions(await FactionsDB.getAll(selectedCampaignId));
    return result;
  }, [selectedCampaignId]);

  const deleteFaction = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await FactionsDB.delete(id);
    setFactions(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Hooks ----
  const upsertHook = useCallback(async (h: Omit<HookInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return;
    await HooksDB.upsert({ ...h, campaign_id: selectedCampaignId });
    setHooks(await HooksDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deleteHook = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await HooksDB.delete(id);
    setHooks(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Lore ----
  const upsertLore = useCallback(async (e: LoreEntryInsert & { id?: string }) => {
    const result = await LoreDB.upsert(e);
    setLore(await LoreDB.getAll());
    return result;
  }, []);

  const deleteLore = useCallback(async (id: string) => {
    await LoreDB.delete(id);
    setLore(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- Modules ----
  const upsertModule = useCallback(async (m: Omit<ModuleInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return undefined;
    const mod = await ModulesDB.upsert({ ...m, campaign_id: selectedCampaignId });
    setModules(await ModulesDB.getAll(selectedCampaignId));
    return mod;
  }, [selectedCampaignId]);

  const deleteModule = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await ModulesDB.delete(id);
    setModules(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Relationships ----
  const upsertRelationship = useCallback(async (rel: Omit<CharacterRelationshipInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return;
    await RelationshipsDB.upsert({ ...rel, campaign_id: selectedCampaignId });
    setRelationships(await RelationshipsDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deleteRelationship = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await RelationshipsDB.delete(id);
    setRelationships(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Submodules ----
  const loadSubmodules = useCallback(async (moduleId: string) => {
    setSubmodules(await SubmodulesDB.getByModule(moduleId));
  }, []);

  const upsertSubmodule = useCallback(async (s: SubmoduleInsert & { id?: string }) => {
    await SubmodulesDB.upsert(s);
    setSubmodules(await SubmodulesDB.getByModule(s.module_id));
  }, []);

  const deleteSubmodule = useCallback(async (id: string, moduleId: string) => {
    await SubmodulesDB.delete(id);
    setSubmodules(await SubmodulesDB.getByModule(moduleId));
  }, []);

  // ---- Scenes ----
  const loadScenes = useCallback(async (submoduleId: string) => {
    setScenes(await ScenesDB.getBySubmodule(submoduleId));
  }, []);

  const upsertScene = useCallback(async (s: SceneInsert & { id?: string }) => {
    await ScenesDB.upsert(s);
    setScenes(await ScenesDB.getBySubmodule(s.submodule_id));
  }, []);

  const deleteScene = useCallback(async (id: string, submoduleId: string) => {
    await ScenesDB.delete(id);
    setScenes(await ScenesDB.getBySubmodule(submoduleId));
  }, []);

  // ---- Module Sheets ----
  const loadModuleSheets = useCallback(async (moduleId: string) => {
    setModuleSheets(await ModuleSheetsDB.getByModule(moduleId));
  }, []);

  const upsertModuleSheet = useCallback(async (s: ModuleSheetInsert & { id?: string }) => {
    await ModuleSheetsDB.upsert(s);
    setModuleSheets(await ModuleSheetsDB.getByModule(s.module_id));
  }, []);

  const deleteModuleSheet = useCallback(async (id: string, moduleId: string) => {
    await ModuleSheetsDB.delete(id);
    setModuleSheets(await ModuleSheetsDB.getByModule(moduleId));
  }, []);

  // ---- Encounters ----
  const upsertEncounter = useCallback(async (e: Omit<EncounterInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return {} as Encounter;
    const result = await EncountersDB.upsert({ ...e, campaign_id: selectedCampaignId });
    setEncounters(await EncountersDB.getAll(selectedCampaignId));
    return result;
  }, [selectedCampaignId]);

  const deleteEncounter = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await EncountersDB.delete(id);
    setEncounters(prev => prev.filter(e => e.id !== id));
  }, [selectedCampaignId]);

  // ---- Session Prep ----
  const upsertSessionPrep = useCallback(async (p: Omit<SessionPrepInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return;
    await SessionPrepsDB.upsert({ ...p, campaign_id: selectedCampaignId });
    setSessionPreps(await SessionPrepsDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deleteSessionPrep = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await SessionPrepsDB.delete(id);
    setSessionPreps(prev => prev.filter(p => p.id !== id));
  }, [selectedCampaignId]);

  // ---- Module Dependencies ----
  const loadModuleDeps = useCallback(async (campaignId: string) => {
    setModuleDeps(await ModuleDepsDB.getByCampaign(campaignId));
  }, []);

  const upsertModuleDep = useCallback(async (dep: ModuleDependencyInsert & { id?: string }) => {
    await ModuleDepsDB.upsert(dep);
    setModuleDeps(await ModuleDepsDB.getByCampaign(dep.campaign_id));
  }, []);

  const deleteModuleDep = useCallback(async (id: string) => {
    await ModuleDepsDB.delete(id);
    setModuleDeps(prev => prev.filter(d => d.id !== id));
  }, []);

  // ---- Submodule Dependencies ----
  const loadSubmoduleDeps = useCallback(async (moduleId: string) => {
    setSubmoduleDeps(await SubmoduleDepsDB.getByModule(moduleId));
  }, []);

  const upsertSubmoduleDep = useCallback(async (dep: SubmoduleDependencyInsert & { id?: string }) => {
    await SubmoduleDepsDB.upsert(dep);
    // Reload for the module that owns this submodule
    const sub = submodules.find(s => s.id === dep.dependent_id);
    if (sub) setSubmoduleDeps(await SubmoduleDepsDB.getByModule(sub.module_id));
  }, [submodules]);

  const deleteSubmoduleDep = useCallback(async (id: string) => {
    await SubmoduleDepsDB.delete(id);
    setSubmoduleDeps(prev => prev.filter(d => d.id !== id));
  }, []);

  // ---- Monster Statblocks ----
  const upsertMonsterStatblock = useCallback(async (m: Omit<MonsterStatblockInsert, 'campaign_id'> & { id?: string }): Promise<MonsterStatblock> => {
    if (!selectedCampaignId) throw new Error('No campaign selected');
    const sb = await MonsterStatblocksDB.upsert({ ...m, campaign_id: selectedCampaignId });
    setMonsterStatblocks(await MonsterStatblocksDB.getAll(selectedCampaignId));
    return sb;
  }, [selectedCampaignId]);

  const deleteMonsterStatblock = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await MonsterStatblocksDB.delete(id);
    setMonsterStatblocks(prev => prev.filter(m => m.id !== id));
  }, [selectedCampaignId]);

  return (
    <CampaignContext.Provider value={{
      campaigns, selectedCampaignId, selectedCampaign,
      createCampaign, updateCampaign, deleteCampaign, switchCampaign,
      overview, setOverview,
      sessions, pcs, npcs, globalNPCs, linkedNPCIds,
      locations, globalLocations, linkedLocationIds,
      factions, hooks, lore, modules, relationships,
      loading, error,
      upsertSession: withToast(upsertSession),
      deleteSession: withToast(deleteSession, 'Session deleted'),
      upsertPC: withToast(upsertPC),
      deletePC: withToast(deletePC, 'Character deleted'),
      upsertNPC: withToast(upsertNPC),
      deleteNPC: withToast(deleteNPC, 'NPC deleted'),
      linkNPCToCampaign: withToast(linkNPCToCampaign),
      unlinkNPCFromCampaign: withToast(unlinkNPCFromCampaign),
      upsertLocation: withToast(upsertLocation),
      deleteLocation: withToast(deleteLocation, 'Location deleted'),
      linkLocationToCampaign: withToast(linkLocationToCampaign),
      unlinkLocationFromCampaign: withToast(unlinkLocationFromCampaign),
      upsertFaction: withToast(upsertFaction),
      deleteFaction: withToast(deleteFaction, 'Faction deleted'),
      upsertHook: withToast(upsertHook),
      deleteHook: withToast(deleteHook, 'Hook deleted'),
      upsertLore: withToast(upsertLore),
      deleteLore: withToast(deleteLore, 'Lore deleted'),
      upsertModule: withToast(upsertModule),
      deleteModule: withToast(deleteModule, 'Module deleted'),
      upsertRelationship: withToast(upsertRelationship),
      deleteRelationship: withToast(deleteRelationship),
      submodules, loadSubmodules,
      upsertSubmodule: withToast(upsertSubmodule),
      deleteSubmodule: withToast(deleteSubmodule, 'Submodule deleted'),
      scenes, loadScenes,
      upsertScene: withToast(upsertScene),
      deleteScene: withToast(deleteScene, 'Scene deleted'),
      moduleSheets, loadModuleSheets,
      upsertModuleSheet: withToast(upsertModuleSheet),
      deleteModuleSheet: withToast(deleteModuleSheet),
      monsterStatblocks,
      upsertMonsterStatblock: withToast(upsertMonsterStatblock),
      deleteMonsterStatblock: withToast(deleteMonsterStatblock, 'Stat sheet deleted'),
      encounters,
      upsertEncounter: withToast(upsertEncounter),
      deleteEncounter: withToast(deleteEncounter, 'Encounter deleted'),
      sessionPreps,
      upsertSessionPrep: withToast(upsertSessionPrep),
      deleteSessionPrep: withToast(deleteSessionPrep, 'Prep notes deleted'),
      moduleDeps, loadModuleDeps,
      upsertModuleDep: withToast(upsertModuleDep),
      deleteModuleDep: withToast(deleteModuleDep),
      submoduleDeps, loadSubmoduleDeps,
      upsertSubmoduleDep: withToast(upsertSubmoduleDep),
      deleteSubmoduleDep: withToast(deleteSubmoduleDep),
    }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (!context) throw new Error('useCampaign must be used within CampaignProvider');
  return context;
}
