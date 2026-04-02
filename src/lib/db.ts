// src/lib/db.ts
// -----------------------------------------------------------
// Typed data access layer for all campaign tables.
// All writes automatically inject the current user's ID.
// All reads are scoped to the current user via RLS.
// -----------------------------------------------------------

import { supabase } from './supabase';
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
} from './database.types';

// --------------- Helper ---------------

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

// ============================================================
// CAMPAIGNS
// ============================================================

export const Campaigns = {
  async getAll(): Promise<Campaign[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(campaign: CampaignInsert & { id?: string }): Promise<Campaign> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('campaigns')
      .upsert({ ...campaign, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// CAMPAIGN NPC LINKS (global NPC ↔ campaign join table)
// ============================================================

export const CampaignNPCs = {
  async getLinkedNPCIds(campaignId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('campaign_npcs')
      .select('npc_id')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return (data ?? []).map(row => row.npc_id);
  },

  async link(campaignId: string, npcId: string): Promise<void> {
    const user_id = await getUserId();
    const { error } = await supabase
      .from('campaign_npcs')
      .upsert({ campaign_id: campaignId, npc_id: npcId, user_id });
    if (error) throw error;
  },

  async unlink(campaignId: string, npcId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_npcs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('npc_id', npcId);
    if (error) throw error;
  },
};

// ============================================================
// CAMPAIGN LOCATION LINKS (global Location ↔ campaign join table)
// ============================================================

export const CampaignLocations = {
  async getLinkedLocationIds(campaignId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('campaign_locations')
      .select('location_id')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return (data ?? []).map(row => row.location_id);
  },

  async link(campaignId: string, locationId: string): Promise<void> {
    const user_id = await getUserId();
    const { error } = await supabase
      .from('campaign_locations')
      .upsert({ campaign_id: campaignId, location_id: locationId, user_id });
    if (error) throw error;
  },

  async unlink(campaignId: string, locationId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_locations')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('location_id', locationId);
    if (error) throw error;
  },
};

// ============================================================
// SESSIONS
// ============================================================

export const Sessions = {
  async getAll(campaignId: string): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('session_number', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getByNumber(sessionNumber: number, campaignId: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('session_number', sessionNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(session: SessionInsert): Promise<Session> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('sessions')
      .upsert({ ...session, user_id }, { onConflict: 'campaign_id,session_number' })
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
  async getAll(campaignId: string): Promise<PlayerCharacter[]> {
    const { data, error } = await supabase
      .from('player_characters')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('character_name');
    if (error) throw error;
    return data;
  },

  async getActive(campaignId: string): Promise<PlayerCharacter[]> {
    const { data, error } = await supabase
      .from('player_characters')
      .select('*')
      .eq('campaign_id', campaignId)
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
  // Global NPCs (not tied to any campaign)
  async getGlobal(): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .is('campaign_id', null)
      .order('name');
    if (error) throw error;
    return data;
  },

  // Campaign-specific NPCs (created directly in a campaign)
  async getByCampaign(campaignId: string): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .eq('campaign_id', campaignId)
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
  // Global locations (not tied to any campaign)
  async getGlobal(): Promise<Location[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .is('campaign_id', null)
      .order('name');
    if (error) throw error;
    return data;
  },

  // Campaign-specific locations
  async getByCampaign(campaignId: string): Promise<Location[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('campaign_id', campaignId)
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
  async getAll(campaignId: string): Promise<Faction[]> {
    const { data, error } = await supabase
      .from('factions')
      .select('*')
      .eq('campaign_id', campaignId)
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
  async getAll(campaignId: string): Promise<Hook[]> {
    const { data, error } = await supabase
      .from('hooks')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('last_updated_session', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data;
  },

  async getActive(campaignId: string): Promise<Hook[]> {
    const { data, error } = await supabase
      .from('hooks')
      .select('*')
      .eq('campaign_id', campaignId)
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
// LORE ENTRIES (global — not campaign-scoped)
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
  async getAll(campaignId: string): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('chapter');
    if (error) throw error;
    return data;
  },

  async getByStatus(status: Module['status'], campaignId: string): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('campaign_id', campaignId)
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
  async getAll(campaignId: string): Promise<CharacterRelationship[]> {
    const { data, error } = await supabase
      .from('character_relationships')
      .select('*')
      .eq('campaign_id', campaignId)
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

// ============================================================
// SUBMODULES
// ============================================================

export const Submodules = {
  async getByModule(moduleId: string): Promise<Submodule[]> {
    const { data, error } = await supabase
      .from('submodules')
      .select('*')
      .eq('module_id', moduleId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(sub: SubmoduleInsert & { id?: string }): Promise<Submodule> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('submodules')
      .upsert({ ...sub, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('submodules').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// SCENES
// ============================================================

export const Scenes = {
  async getBySubmodule(submoduleId: string): Promise<Scene[]> {
    const { data, error } = await supabase
      .from('scenes')
      .select('*')
      .eq('submodule_id', submoduleId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(scene: SceneInsert & { id?: string }): Promise<Scene> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('scenes')
      .upsert({ ...scene, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('scenes').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// MONSTER STATBLOCKS
// ============================================================

export const MonsterStatblocks = {
  async getAll(campaignId: string): Promise<MonsterStatblock[]> {
    const { data, error } = await supabase
      .from('monster_statblocks')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(monster: MonsterStatblockInsert & { id?: string }): Promise<MonsterStatblock> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('monster_statblocks')
      .upsert({ ...monster, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('monster_statblocks').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// MODULE SHEETS
// ============================================================

export const ModuleSheets = {
  async getByModule(moduleId: string): Promise<ModuleSheet[]> {
    const { data, error } = await supabase
      .from('module_sheets')
      .select('*')
      .eq('module_id', moduleId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(sheet: ModuleSheetInsert & { id?: string }): Promise<ModuleSheet> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('module_sheets')
      .upsert({ ...sheet, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('module_sheets').delete().eq('id', id);
    if (error) throw error;
  },
};
