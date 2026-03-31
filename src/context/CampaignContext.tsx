import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import type { CampaignOverview } from '../types';
import {
  Sessions as SessionsDB,
  PlayerCharacters as PlayerCharactersDB,
  NPCs as NPCsDB,
  Locations as LocationsDB,
  Factions as FactionsDB,
  Hooks as HooksDB,
  Lore as LoreDB,
  Modules as ModulesDB,
} from '../lib/db';
import type {
  Session, SessionInsert,
  PlayerCharacter, PlayerCharacterInsert,
  NPC, NPCInsert,
  Location, LocationInsert,
  Faction, FactionInsert,
  Hook, HookInsert,
  LoreEntry, LoreEntryInsert,
  Module, ModuleInsert,
} from '../lib/database.types';

const defaultOverview: CampaignOverview = {
  title: '',
  plotSummary: '',
  majorCharacters: '',
  worldInfo: '',
};

interface CampaignContextType {
  // Campaign overview — no DB table yet, kept in localStorage
  overview: CampaignOverview;
  setOverview: (o: CampaignOverview | ((prev: CampaignOverview) => CampaignOverview)) => void;

  // DB-backed entities
  sessions: Session[];
  pcs: PlayerCharacter[];
  npcs: NPC[];
  locations: Location[];
  factions: Faction[];
  hooks: Hook[];
  lore: LoreEntry[];
  modules: Module[];

  loading: boolean;
  error: string | null;

  // Sessions
  upsertSession: (s: SessionInsert) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Player Characters
  upsertPC: (pc: PlayerCharacterInsert & { id?: string }) => Promise<void>;
  deletePC: (id: string) => Promise<void>;

  // NPCs
  upsertNPC: (npc: NPCInsert & { id?: string }) => Promise<void>;
  deleteNPC: (id: string) => Promise<void>;

  // Locations
  upsertLocation: (loc: LocationInsert & { id?: string }) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  // Factions
  upsertFaction: (f: FactionInsert & { id?: string }) => Promise<void>;
  deleteFaction: (id: string) => Promise<void>;

  // Hooks / ideas
  upsertHook: (h: HookInsert & { id?: string }) => Promise<void>;
  deleteHook: (id: string) => Promise<void>;

  // Lore entries
  upsertLore: (e: LoreEntryInsert & { id?: string }) => Promise<void>;
  deleteLore: (id: string) => Promise<void>;

  // Modules
  upsertModule: (m: ModuleInsert & { id?: string }) => Promise<void>;
  deleteModule: (id: string) => Promise<void>;
}

const CampaignContext = createContext<CampaignContextType | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useLocalStorage<CampaignOverview>('dnd-campaign-overview', defaultOverview);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [pcs, setPCs] = useState<PlayerCharacter[]>([]);
  const [npcs, setNPCs] = useState<NPC[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, n, l, f, h, le, m] = await Promise.all([
        SessionsDB.getAll(),
        PlayerCharactersDB.getAll(),
        NPCsDB.getAll(),
        LocationsDB.getAll(),
        FactionsDB.getAll(),
        HooksDB.getAll(),
        LoreDB.getAll(),
        ModulesDB.getAll(),
      ]);
      setSessions(s);
      setPCs(p);
      setNPCs(n);
      setLocations(l);
      setFactions(f);
      setHooks(h);
      setLore(le);
      setModules(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Sessions ----
  const upsertSession = useCallback(async (s: SessionInsert) => {
    await SessionsDB.upsert(s);
    setSessions(await SessionsDB.getAll());
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await SessionsDB.delete(id);
    setSessions(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- Player Characters ----
  const upsertPC = useCallback(async (pc: PlayerCharacterInsert & { id?: string }) => {
    await PlayerCharactersDB.upsert(pc);
    setPCs(await PlayerCharactersDB.getAll());
  }, []);

  const deletePC = useCallback(async (id: string) => {
    await PlayerCharactersDB.delete(id);
    setPCs(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- NPCs ----
  const upsertNPC = useCallback(async (npc: NPCInsert & { id?: string }) => {
    await NPCsDB.upsert(npc);
    setNPCs(await NPCsDB.getAll());
  }, []);

  const deleteNPC = useCallback(async (id: string) => {
    await NPCsDB.delete(id);
    setNPCs(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- Locations ----
  const upsertLocation = useCallback(async (loc: LocationInsert & { id?: string }) => {
    await LocationsDB.upsert(loc);
    setLocations(await LocationsDB.getAll());
  }, []);

  const deleteLocation = useCallback(async (id: string) => {
    await LocationsDB.delete(id);
    setLocations(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- Factions ----
  const upsertFaction = useCallback(async (f: FactionInsert & { id?: string }) => {
    await FactionsDB.upsert(f);
    setFactions(await FactionsDB.getAll());
  }, []);

  const deleteFaction = useCallback(async (id: string) => {
    await FactionsDB.delete(id);
    setFactions(prev => prev.filter(r => r.id !== id));
  }, []);

  // ---- Hooks ----
  const upsertHook = useCallback(async (h: HookInsert & { id?: string }) => {
    await HooksDB.upsert(h);
    setHooks(await HooksDB.getAll());
  }, []);

  const deleteHook = useCallback(async (id: string) => {
    await HooksDB.delete(id);
    setHooks(prev => prev.filter(r => r.id !== id));
  }, []);

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
  const upsertModule = useCallback(async (m: ModuleInsert & { id?: string }) => {
    await ModulesDB.upsert(m);
    setModules(await ModulesDB.getAll());
  }, []);

  const deleteModule = useCallback(async (id: string) => {
    await ModulesDB.delete(id);
    setModules(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <CampaignContext.Provider value={{
      overview, setOverview,
      sessions, pcs, npcs, locations, factions, hooks, lore, modules,
      loading, error,
      upsertSession, deleteSession,
      upsertPC, deletePC,
      upsertNPC, deleteNPC,
      upsertLocation, deleteLocation,
      upsertFaction, deleteFaction,
      upsertHook, deleteHook,
      upsertLore, deleteLore,
      upsertModule, deleteModule,
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
