// src/lib/db.ts
// -----------------------------------------------------------
// Typed data access layer for all campaign tables.
// All writes automatically inject the current user's ID.
// All reads are scoped to the current user via RLS.
// -----------------------------------------------------------

import { supabase } from './supabase';
import type {
  Session, SessionInsert,
  PlayerCharacter, PlayerCharacterInsert,
  NPC, NPCInsert,
  Location, LocationInsert,
  Faction, FactionInsert,
  Hook, HookInsert,
  LoreEntry, LoreEntryInsert,
  Module, ModuleInsert,
  CharacterRelationship, CharacterRelationshipInsert,
} from './database.types';

// --------------- Helper ---------------

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

// ============================================================
// SESSIONS
// ============================================================

export const Sessions = {
  async getAll(): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_number', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getByNumber(sessionNumber: number): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_number', sessionNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(session: SessionInsert): Promise<Session> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('sessions')
      .upsert({ ...session, user_id }, { onConflict: 'user_id,session_number' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// PLAYER CHARACTERS
// ============================================================

export const PlayerCharacters = {
  async getAll(): Promise<PlayerCharacter[]> {
    const { data, error } = await supabase
      .from('player_characters')
      .select('*')
      .order('character_name');
    if (error) throw error;
    return data;
  },

  async getActive(): Promise<PlayerCharacter[]> {
    const { data, error } = await supabase
      .from('player_characters')
      .select('*')
      .eq('is_active', true)
      .order('character_name');
    if (error) throw error;
    return data;
  },

  async upsert(pc: PlayerCharacterInsert & { id?: string }): Promise<PlayerCharacter> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('player_characters')
      .upsert({ ...pc, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('player_characters').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// NPCS
// ============================================================

export const NPCs = {
  async getAll(): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async getByStatus(status: NPC['status']): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .eq('status', status)
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(npc: NPCInsert & { id?: string }): Promise<NPC> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('npcs')
      .upsert({ ...npc, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('npcs').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// LOCATIONS
// ============================================================

export const Locations = {
  async getAll(): Promise<Location[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(location: LocationInsert & { id?: string }): Promise<Location> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('locations')
      .upsert({ ...location, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// FACTIONS
// ============================================================

export const Factions = {
  async getAll(): Promise<Faction[]> {
    const { data, error } = await supabase
      .from('factions')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(faction: FactionInsert & { id?: string }): Promise<Faction> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('factions')
      .upsert({ ...faction, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('factions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// HOOKS
// ============================================================

export const Hooks = {
  async getAll(): Promise<Hook[]> {
    const { data, error } = await supabase
      .from('hooks')
      .select('*')
      .order('last_updated_session', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data;
  },

  async getActive(): Promise<Hook[]> {
    const { data, error } = await supabase
      .from('hooks')
      .select('*')
      .eq('is_active', true)
      .order('last_updated_session', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data;
  },

  async upsert(hook: HookInsert & { id?: string }): Promise<Hook> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('hooks')
      .upsert({ ...hook, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('hooks').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// LORE ENTRIES
// ============================================================

export const Lore = {
  async getAll(): Promise<LoreEntry[]> {
    const { data, error } = await supabase
      .from('lore_entries')
      .select('*')
      .order('title');
    if (error) throw error;
    return data;
  },

  async getByCategory(category: string): Promise<LoreEntry[]> {
    const { data, error } = await supabase
      .from('lore_entries')
      .select('*')
      .eq('category', category)
      .order('title');
    if (error) throw error;
    return data;
  },

  async upsert(entry: LoreEntryInsert & { id?: string }): Promise<LoreEntry> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('lore_entries')
      .upsert({ ...entry, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('lore_entries').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// MODULES
// ============================================================

export const Modules = {
  async getAll(): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .order('chapter');
    if (error) throw error;
    return data;
  },

  async getByStatus(status: Module['status']): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('status', status)
      .order('chapter');
    if (error) throw error;
    return data;
  },

  async upsert(module: ModuleInsert & { id?: string }): Promise<Module> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('modules')
      .upsert({ ...module, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('modules').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// CHARACTER RELATIONSHIPS
// ============================================================

export const Relationships = {
  async getAll(): Promise<CharacterRelationship[]> {
    const { data, error } = await supabase
      .from('character_relationships')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data;
  },

  async upsert(rel: CharacterRelationshipInsert & { id?: string }): Promise<CharacterRelationship> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('character_relationships')
      .upsert({ ...rel, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('character_relationships').delete().eq('id', id);
    if (error) throw error;
  },
};