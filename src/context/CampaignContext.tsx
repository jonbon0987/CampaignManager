import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import type { CampaignOverview } from '../types';
import {
  Campaigns as CampaignsDB,
  CampaignNPCs as CampaignNPCsDB,
  CampaignLocations as CampaignLocationsDB,
  Sessions as SessionsDB,
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
  upsertSession: (s: Omit<SessionInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Player Characters
  upsertPC: (pc: Omit<PlayerCharacterInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deletePC: (id: string) => Promise<void>;

  // NPCs — scope: 'campaign' creates campaign-specific, 'global' creates in global pool
  upsertNPC: (npc: Omit<NPCInsert, 'campaign_id'> & { id?: string }, scope?: 'campaign' | 'global') => Promise<void>;
  deleteNPC: (id: string) => Promise<void>;
  linkNPCToCampaign: (npcId: string) => Promise<void>;
  unlinkNPCFromCampaign: (npcId: string) => Promise<void>;

  // Locations
  upsertLocation: (loc: Omit<LocationInsert, 'campaign_id'> & { id?: string }, scope?: 'campaign' | 'global') => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  linkLocationToCampaign: (locationId: string) => Promise<void>;
  unlinkLocationFromCampaign: (locationId: string) => Promise<void>;

  // Factions
  upsertFaction: (f: Omit<FactionInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteFaction: (id: string) => Promise<void>;

  // Hooks / ideas
  upsertHook: (h: Omit<HookInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteHook: (id: string) => Promise<void>;

  // Lore entries (global)
  upsertLore: (e: LoreEntryInsert & { id?: string }) => Promise<void>;
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
  upsertEncounter: (e: Omit<EncounterInsert, 'campaign_id'> & { id?: string }) => Promise<void>;
  deleteEncounter: (id: string) => Promise<void>;

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
  // Campaign list + selected campaign (persisted in localStorage)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useLocalStorage<string | null>('dnd-selected-campaign-id', null);

  // Campaign-scoped entities
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pcs, setPCs] = useState<PlayerCharacter[]>([]);
  // Campaign-specific NPCs (campaign_id = selectedCampaignId)
  const [campaignNPCs, setCampaignNPCs] = useState<NPC[]>([]);
  // Global NPCs (campaign_id IS NULL)
  const [globalNPCs, setGlobalNPCs] = useState<NPC[]>([]);
  // IDs of global NPCs linked to current campaign via campaign_npcs join table
  const [linkedNPCIds, setLinkedNPCIds] = useState<string[]>([]);
  // Campaign-specific locations
  const [campaignLocations, setCampaignLocations] = useState<Location[]>([]);
  // Global locations
  const [globalLocations, setGlobalLocations] = useState<Location[]>([]);
  // IDs of global locations linked to current campaign
  const [linkedLocationIds, setLinkedLocationIds] = useState<string[]>([]);
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
  const [moduleDeps, setModuleDeps] = useState<ModuleDependency[]>([]);
  const [submoduleDeps, setSubmoduleDeps] = useState<SubmoduleDependency[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Merged NPC/location arrays for backwards-compatible consumers:
  // campaign-specific + linked global items
  const npcs = useMemo(() => {
    const linkedGlobals = globalNPCs.filter(n => linkedNPCIds.includes(n.id));
    return [...campaignNPCs, ...linkedGlobals];
  }, [campaignNPCs, globalNPCs, linkedNPCIds]);

  const locations = useMemo(() => {
    const linkedGlobals = globalLocations.filter(l => linkedLocationIds.includes(l.id));
    return [...campaignLocations, ...linkedGlobals];
  }, [campaignLocations, globalLocations, linkedLocationIds]);

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
      const [s, p, cn, gn, lnIds, cl, gl, llIds, f, h, le, m, r] = await Promise.all([
        SessionsDB.getAll(campaignId),
        PlayerCharactersDB.getAll(campaignId),
        NPCsDB.getByCampaign(campaignId),
        NPCsDB.getGlobal(),
        CampaignNPCsDB.getLinkedNPCIds(campaignId),
        LocationsDB.getByCampaign(campaignId),
        LocationsDB.getGlobal(),
        CampaignLocationsDB.getLinkedLocationIds(campaignId),
        FactionsDB.getAll(campaignId),
        HooksDB.getAll(campaignId),
        LoreDB.getAll(),
        ModulesDB.getAll(campaignId),
        RelationshipsDB.getAll(campaignId),
      ]);
      setSessions(s);
      setPCs(p);
      setCampaignNPCs(cn);
      setGlobalNPCs(gn);
      setLinkedNPCIds(lnIds);
      setCampaignLocations(cl);
      setGlobalLocations(gl);
      setLinkedLocationIds(llIds);
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
        setModuleDeps(await ModuleDepsDB.getByCampaign(campaignId));
      } catch {
        // table doesn't exist yet — silently ignore until migration is applied
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!selectedCampaignId) return;
    await SessionsDB.upsert({ ...s, campaign_id: selectedCampaignId });
    setSessions(await SessionsDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deleteSession = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await SessionsDB.delete(id);
    setSessions(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- Player Characters ----
  const upsertPC = useCallback(async (pc: Omit<PlayerCharacterInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return;
    await PlayerCharactersDB.upsert({ ...pc, campaign_id: selectedCampaignId });
    setPCs(await PlayerCharactersDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deletePC = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await PlayerCharactersDB.delete(id);
    setPCs(prev => prev.filter(r => r.id !== id));
  }, [selectedCampaignId]);

  // ---- NPCs ----
  const refreshNPCs = useCallback(async (campaignId: string) => {
    const [cn, gn, lnIds] = await Promise.all([
      NPCsDB.getByCampaign(campaignId),
      NPCsDB.getGlobal(),
      CampaignNPCsDB.getLinkedNPCIds(campaignId),
    ]);
    setCampaignNPCs(cn);
    setGlobalNPCs(gn);
    setLinkedNPCIds(lnIds);
  }, []);

  const upsertNPC = useCallback(async (
    npc: Omit<NPCInsert, 'campaign_id'> & { id?: string },
    scope: 'campaign' | 'global' = 'campaign'
  ) => {
    if (!selectedCampaignId) return;
    const campaign_id = scope === 'campaign' ? selectedCampaignId : null;
    await NPCsDB.upsert({ ...npc, campaign_id });
    await refreshNPCs(selectedCampaignId);
  }, [selectedCampaignId, refreshNPCs]);

  const deleteNPC = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await NPCsDB.delete(id);
    await refreshNPCs(selectedCampaignId);
  }, [selectedCampaignId, refreshNPCs]);

  const linkNPCToCampaign = useCallback(async (npcId: string) => {
    if (!selectedCampaignId) return;
    await CampaignNPCsDB.link(selectedCampaignId, npcId);
    setLinkedNPCIds(prev => prev.includes(npcId) ? prev : [...prev, npcId]);
  }, [selectedCampaignId]);

  const unlinkNPCFromCampaign = useCallback(async (npcId: string) => {
    if (!selectedCampaignId) return;
    await CampaignNPCsDB.unlink(selectedCampaignId, npcId);
    setLinkedNPCIds(prev => prev.filter(id => id !== npcId));
  }, [selectedCampaignId]);

  // ---- Locations ----
  const refreshLocations = useCallback(async (campaignId: string) => {
    const [cl, gl, llIds] = await Promise.all([
      LocationsDB.getByCampaign(campaignId),
      LocationsDB.getGlobal(),
      CampaignLocationsDB.getLinkedLocationIds(campaignId),
    ]);
    setCampaignLocations(cl);
    setGlobalLocations(gl);
    setLinkedLocationIds(llIds);
  }, []);

  const upsertLocation = useCallback(async (
    loc: Omit<LocationInsert, 'campaign_id'> & { id?: string },
    scope: 'campaign' | 'global' = 'campaign'
  ) => {
    if (!selectedCampaignId) return;
    const campaign_id = scope === 'campaign' ? selectedCampaignId : null;
    await LocationsDB.upsert({ ...loc, campaign_id });
    await refreshLocations(selectedCampaignId);
  }, [selectedCampaignId, refreshLocations]);

  const deleteLocation = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await LocationsDB.delete(id);
    await refreshLocations(selectedCampaignId);
  }, [selectedCampaignId, refreshLocations]);

  const linkLocationToCampaign = useCallback(async (locationId: string) => {
    if (!selectedCampaignId) return;
    await CampaignLocationsDB.link(selectedCampaignId, locationId);
    setLinkedLocationIds(prev => prev.includes(locationId) ? prev : [...prev, locationId]);
  }, [selectedCampaignId]);

  const unlinkLocationFromCampaign = useCallback(async (locationId: string) => {
    if (!selectedCampaignId) return;
    await CampaignLocationsDB.unlink(selectedCampaignId, locationId);
    setLinkedLocationIds(prev => prev.filter(id => id !== locationId));
  }, [selectedCampaignId]);

  // ---- Factions ----
  const upsertFaction = useCallback(async (f: Omit<FactionInsert, 'campaign_id'> & { id?: string }) => {
    if (!selectedCampaignId) return;
    await FactionsDB.upsert({ ...f, campaign_id: selectedCampaignId });
    setFactions(await FactionsDB.getAll(selectedCampaignId));
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
    await LoreDB.upsert(e);
    setLore(await LoreDB.getAll());
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
    if (!selectedCampaignId) return;
    await EncountersDB.upsert({ ...e, campaign_id: selectedCampaignId });
    setEncounters(await EncountersDB.getAll(selectedCampaignId));
  }, [selectedCampaignId]);

  const deleteEncounter = useCallback(async (id: string) => {
    if (!selectedCampaignId) return;
    await EncountersDB.delete(id);
    setEncounters(prev => prev.filter(e => e.id !== id));
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
      upsertSession, deleteSession,
      upsertPC, deletePC,
      upsertNPC, deleteNPC, linkNPCToCampaign, unlinkNPCFromCampaign,
      upsertLocation, deleteLocation, linkLocationToCampaign, unlinkLocationFromCampaign,
      upsertFaction, deleteFaction,
      upsertHook, deleteHook,
      upsertLore, deleteLore,
      upsertModule, deleteModule,
      upsertRelationship, deleteRelationship,
      submodules, loadSubmodules, upsertSubmodule, deleteSubmodule,
      scenes, loadScenes, upsertScene, deleteScene,
      moduleSheets, loadModuleSheets, upsertModuleSheet, deleteModuleSheet,
      monsterStatblocks, upsertMonsterStatblock, deleteMonsterStatblock,
      encounters, upsertEncounter, deleteEncounter,
      moduleDeps, loadModuleDeps, upsertModuleDep, deleteModuleDep,
      submoduleDeps, loadSubmoduleDeps, upsertSubmoduleDep, deleteSubmoduleDep,
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
