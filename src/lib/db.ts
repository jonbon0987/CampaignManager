// src/lib/db.ts
// -----------------------------------------------------------
// Typed data access layer for all campaign tables.
// All writes automatically inject the current user's ID.
// All reads are scoped to the current user via RLS.
// -----------------------------------------------------------

import { supabase } from './supabase';
import { validateFieldLimits } from './fieldLimits';
import type {
  DbWorld, DbWorldInsert,
  Campaign, CampaignInsert, CampaignWithCount,
  Session, SessionInsert,
  SessionPrep, SessionPrepInsert,
  PlayerCharacter, PlayerCharacterInsert,
  NPC, NPCInsert,
  Location, LocationInsert,
  Faction, FactionInsert,
  Hook, HookInsert,
  Idea, IdeaInsert,
  LoreEntry, LoreEntryInsert,
  Module, ModuleInsert,
  CharacterRelationship, CharacterRelationshipInsert,
  Submodule, SubmoduleInsert,
  Scene, SceneInsert,
  ModuleSheet, ModuleSheetInsert,
  MonsterStatblock, MonsterStatblockInsert,
  Encounter, EncounterInsert,
  RandomEncounterTable, RandomEncounterTableInsert,
  ModuleDependency, ModuleDependencyInsert,
  SubmoduleDependency, SubmoduleDependencyInsert,
  TimelineEvent, TimelineEventInsert,
  SessionRecording, SessionRecordingInsert,
  RecordingTrack, RecordingTrackInsert,
  RecordingChunk, RecordingChunkInsert,
  TranscriptSegment, TranscriptSegmentInsert,
  RecordingMoment, RecordingMomentInsert,
  SpeakerLink, SpeakerLinkInsert,
  PlayerConsent, PlayerConsentInsert,
  ChronicleProposal, ChronicleProposalInsert,
  ChronicleApplied, ChronicleAppliedInsert,
  EntitySessionEntry, EntitySessionEntryInsert, SessionEntryEntityType,
} from './database.types';

// --------------- Helper ---------------

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

// Sessions and session preps are unique per (campaign_id, session_number).
// Postgres reports a clash as a raw 23505 "duplicate key value violates unique
// constraint" — translate it into something a DM can act on.
function sessionNumberError(error: { code?: string }, sessionNumber: number | undefined, what: string) {
  if (error.code === '23505' && sessionNumber != null) {
    return new Error(`${what} ${sessionNumber} already exists in this campaign. Pick a different number.`);
  }
  return error;
}

// ============================================================
// WORLDS
// ============================================================

export const Worlds = {
  async getAll(): Promise<DbWorld[]> {
    const { data, error } = await supabase
      .from('worlds')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(world: DbWorldInsert & { id?: string }): Promise<DbWorld> {
    validateFieldLimits('worlds', world);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('worlds')
      .upsert({ ...world, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('worlds').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// CAMPAIGNS
// ============================================================

export const Campaigns = {
  async getAll(worldId?: string): Promise<CampaignWithCount[]> {
    let query = supabase
      .from('campaigns')
      .select('*, sessions(count)')
      .order('sort_order', { ascending: true });
    if (worldId) query = query.eq('world_id', worldId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      ...c,
      session_count: (c.sessions as { count: number }[])?.[0]?.count ?? 0,
    }));
  },

  async upsert(campaign: CampaignInsert & { id?: string }): Promise<Campaign> {
    validateFieldLimits('campaigns', campaign);
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

// Join table: canon (global) lore entries a campaign has imported.
// Mirrors CampaignLocations — see migrations/0025_campaign_lore.sql.
export const CampaignLore = {
  async getLinkedLoreIds(campaignId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('campaign_lore')
      .select('lore_id')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return (data ?? []).map(row => row.lore_id);
  },

  async link(campaignId: string, loreId: string): Promise<void> {
    const user_id = await getUserId();
    const { error } = await supabase
      .from('campaign_lore')
      .upsert({ campaign_id: campaignId, lore_id: loreId, user_id });
    if (error) throw error;
  },

  async unlink(campaignId: string, loreId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_lore')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('lore_id', loreId);
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

  async upsert(session: SessionInsert & { id?: string }): Promise<Session> {
    validateFieldLimits('sessions', session);
    const user_id = await getUserId();
    // An edit (id present) must target its row by id. Upserting on the
    // (campaign_id, session_number) key with an id attached fails whenever the
    // number changes: a free number inserts a second row carrying the same
    // primary key, and a taken one rewrites the other row's id — both are
    // duplicate-key errors. Id-less saves (assistant, post-session capture)
    // keep the create-or-merge-by-number behaviour.
    const { id, ...fields } = session;
    const query = id
      ? supabase.from('sessions').update({ ...fields, user_id }).eq('id', id)
      : supabase.from('sessions').upsert({ ...fields, user_id }, { onConflict: 'campaign_id,session_number' });
    const { data, error } = await query.select().single();
    if (error) throw sessionNumberError(error, session.session_number, 'Session');
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// SESSION PREP
// ============================================================

export const SessionPreps = {
  async getAll(campaignId: string): Promise<SessionPrep[]> {
    const { data, error } = await supabase
      .from('session_prep')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('session_number', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(prep: SessionPrepInsert & { id?: string }): Promise<SessionPrep> {
    validateFieldLimits('session_prep', prep);
    const user_id = await getUserId();
    // An edit (id present) must target its row by id. Upserting on the
    // (campaign_id, session_number) key with an id attached fails whenever the
    // number changes: a free number inserts a second row carrying the same
    // primary key, and a taken one rewrites the other row's id — both are
    // duplicate-key errors. Id-less saves (assistant, post-session capture)
    // keep the create-or-merge-by-number behaviour.
    const { id, ...fields } = prep;
    const query = id
      ? supabase.from('session_prep').update({ ...fields, user_id }).eq('id', id)
      : supabase.from('session_prep').upsert({ ...fields, user_id }, { onConflict: 'campaign_id,session_number' });
    const { data, error } = await query.select().single();
    if (error) throw sessionNumberError(error, prep.session_number, 'Prep for session');
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('session_prep').delete().eq('id', id);
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
    validateFieldLimits('player_characters', pc);
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
  // Global (canon) NPCs — not tied to any campaign, scoped to one world.
  // worldId is REQUIRED: a campaign's canon pool must never reference another
  // world's data (imports/linking).
  async getGlobal(worldId: string): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .is('campaign_id', null)
      .eq('world_id', worldId)
      .order('name');
    if (error) throw error;
    return data;
  },

  // World-level NPCs (all NPCs scoped to a specific world)
  async getByWorld(worldId: string): Promise<NPC[]> {
    const { data, error } = await supabase
      .from('npcs')
      .select('*')
      .eq('world_id', worldId)
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

  async upsert(npc: NPCInsert & { id?: string }): Promise<NPC> {
    validateFieldLimits('npcs', npc);
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
  // Global locations (not tied to any campaign), scoped to one world.
  // worldId is REQUIRED — a campaign's canon pool stays within its own world.
  async getGlobal(worldId: string): Promise<Location[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .is('campaign_id', null)
      .eq('world_id', worldId)
      .order('name');
    if (error) throw error;
    return data;
  },

  // World-level locations (all locations scoped to a specific world)
  async getByWorld(worldId: string): Promise<Location[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('world_id', worldId)
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
    validateFieldLimits('locations', location);
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

  // World-level factions (all factions scoped to a specific world)
  async getByWorld(worldId: string): Promise<Faction[]> {
    const { data, error } = await supabase
      .from('factions')
      .select('*')
      .eq('world_id', worldId)
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(faction: FactionInsert & { id?: string }): Promise<Faction> {
    validateFieldLimits('factions', faction);
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
    validateFieldLimits('hooks', hook);
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
// IDEAS (raw inbox notes that promote into a hook/thread)
// ============================================================

export const Ideas = {
  async getAll(campaignId: string): Promise<Idea[]> {
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async upsert(idea: IdeaInsert & { id?: string }): Promise<Idea> {
    validateFieldLimits('ideas', idea);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('ideas')
      .upsert({ ...idea, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('ideas').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// LORE ENTRIES (global — not campaign-scoped)
// ============================================================

export const Lore = {
  // Global (canon) lore — not tied to any campaign, scoped to one world.
  // worldId is REQUIRED — mirrors Locations.getGlobal; canon stays within its world.
  async getGlobal(worldId: string): Promise<LoreEntry[]> {
    const { data, error } = await supabase
      .from('lore_entries')
      .select('*')
      .is('campaign_id', null)
      .eq('world_id', worldId)
      .order('title');
    if (error) throw error;
    return data;
  },

  // World-scoped lore — world_id matches AND not campaign-specific
  async getByWorld(worldId: string): Promise<LoreEntry[]> {
    const { data, error } = await supabase
      .from('lore_entries')
      .select('*')
      .eq('world_id', worldId)
      .is('campaign_id', null)
      .order('title');
    if (error) throw error;
    return data;
  },

  // Campaign-scoped lore
  async getByCampaign(campaignId: string): Promise<LoreEntry[]> {
    const { data, error } = await supabase
      .from('lore_entries')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('title');
    if (error) throw error;
    return data;
  },

  async upsert(entry: LoreEntryInsert & { id?: string }): Promise<LoreEntry> {
    validateFieldLimits('lore_entries', entry);
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
// TIMELINE EVENTS
// ============================================================

export const TimelineEvents = {
  async getByWorld(worldId: string): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from('timeline_events')
      .select('*')
      .eq('world_id', worldId)
      .order('year')
      .order('sort_order');
    if (error) throw error;
    return data;
  },

  async upsert(entry: TimelineEventInsert & { id?: string }): Promise<TimelineEvent> {
    validateFieldLimits('timeline_events', entry);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('timeline_events')
      .upsert({ ...entry, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('timeline_events').delete().eq('id', id);
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
    validateFieldLimits('modules', module);
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
    validateFieldLimits('character_relationships', rel);
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

  /** Every submodule across a set of modules — the Module Web needs the whole campaign at once. */
  async getByModules(moduleIds: string[]): Promise<Submodule[]> {
    if (moduleIds.length === 0) return [];
    const { data, error } = await supabase
      .from('submodules')
      .select('*')
      .in('module_id', moduleIds)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Every submodule in a campaign, in one round trip. Submodules are normally
  // loaded a module at a time; the AI assistant needs the whole tree so it can
  // match against what already exists instead of proposing duplicates.
  async getByCampaign(campaignId: string): Promise<Submodule[]> {
    const { data: mods, error: modsError } = await supabase
      .from('modules')
      .select('id')
      .eq('campaign_id', campaignId);
    if (modsError) throw modsError;
    const moduleIds = (mods ?? []).map((m: { id: string }) => m.id);
    return Submodules.getByModules(moduleIds);
  },

  async upsert(sub: SubmoduleInsert & { id?: string }): Promise<Submodule> {
    validateFieldLimits('submodules', sub);
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

  /** Every scene across a set of submodules — the batch form of getBySubmodule (see Submodules.getByModules). */
  async getBySubmodules(submoduleIds: string[]): Promise<Scene[]> {
    if (submoduleIds.length === 0) return [];
    const { data, error } = await supabase
      .from('scenes')
      .select('*')
      .in('submodule_id', submoduleIds)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(scene: SceneInsert & { id?: string }): Promise<Scene> {
    validateFieldLimits('scenes', scene);
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

  // World bestiary — all statblocks scoped to a specific world
  async getByWorld(worldId: string): Promise<MonsterStatblock[]> {
    const { data, error } = await supabase
      .from('monster_statblocks')
      .select('*')
      .eq('world_id', worldId)
      .order('name');
    if (error) throw error;
    return data;
  },

  async upsert(monster: MonsterStatblockInsert & { id?: string }): Promise<MonsterStatblock> {
    validateFieldLimits('monster_statblocks', monster);
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
// ENCOUNTERS
// ============================================================

export const Encounters = {
  async getAll(campaignId: string): Promise<Encounter[]> {
    const { data, error } = await supabase
      .from('encounters')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getByWorld(worldId: string): Promise<Encounter[]> {
    const { data, error } = await supabase
      .from('encounters')
      .select('*')
      .eq('world_id', worldId)
      .is('campaign_id', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(encounter: EncounterInsert & { id?: string }): Promise<Encounter> {
    validateFieldLimits('encounters', encounter);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('encounters')
      .upsert({ ...encounter, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('encounters').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// RANDOM ENCOUNTER TABLES
// ============================================================

export const RandomEncounterTables = {
  async getAll(campaignId: string): Promise<RandomEncounterTable[]> {
    const { data, error } = await supabase
      .from('random_encounter_tables')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getByWorld(worldId: string): Promise<RandomEncounterTable[]> {
    const { data, error } = await supabase
      .from('random_encounter_tables')
      .select('*')
      .eq('world_id', worldId)
      .is('campaign_id', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(table: RandomEncounterTableInsert & { id?: string }): Promise<RandomEncounterTable> {
    validateFieldLimits('random_encounter_tables', table);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('random_encounter_tables')
      .upsert({ ...table, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('random_encounter_tables').delete().eq('id', id);
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
    validateFieldLimits('module_sheets', sheet);
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

// ============================================================
// MODULE DEPENDENCIES
// ============================================================

export const ModuleDeps = {
  async getByCampaign(campaignId: string): Promise<ModuleDependency[]> {
    const { data, error } = await supabase
      .from('module_dependencies')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (error) throw error;
    return data;
  },

  async upsert(dep: ModuleDependencyInsert & { id?: string }): Promise<ModuleDependency> {
    validateFieldLimits('module_dependencies', dep);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('module_dependencies')
      .upsert({ ...dep, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('module_dependencies').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// SUBMODULE DEPENDENCIES
// ============================================================

export const SubmoduleDeps = {
  async getByModule(moduleId: string): Promise<SubmoduleDependency[]> {
    // Two-query approach: get submodule IDs first, then filter deps by dependent_id
    const { data: subs, error: subsError } = await supabase
      .from('submodules')
      .select('id')
      .eq('module_id', moduleId);
    if (subsError) throw subsError;
    const subIds = (subs ?? []).map((s: { id: string }) => s.id);
    if (subIds.length === 0) return [];

    const { data, error } = await supabase
      .from('submodule_dependencies')
      .select('*')
      .in('dependent_id', subIds)
      .order('created_at');
    if (error) throw error;
    return data;
  },

  /** Dependencies among a known set of submodules, either end. */
  async getBySubmodules(submoduleIds: string[]): Promise<SubmoduleDependency[]> {
    if (submoduleIds.length === 0) return [];
    const { data, error } = await supabase
      .from('submodule_dependencies')
      .select('*')
      .in('dependent_id', submoduleIds)
      .order('created_at');
    if (error) throw error;
    return data;
  },

  async upsert(dep: SubmoduleDependencyInsert & { id?: string }): Promise<SubmoduleDependency> {
    validateFieldLimits('submodule_dependencies', dep);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('submodule_dependencies')
      .upsert({ ...dep, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('submodule_dependencies').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// SESSION RECORDINGS
// ============================================================
// Recording a session, transcribing it, and the DM's review of what it proposes
// (migration 0032). Audio lives in the private `session-audio` bucket — see
// SessionAudio below.

export const SessionRecordings = {
  async getBySession(sessionId: string): Promise<SessionRecording[]> {
    const { data, error } = await supabase
      .from('session_recordings')
      .select('*')
      .eq('session_id', sessionId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async get(id: string): Promise<SessionRecording | null> {
    const { data, error } = await supabase
      .from('session_recordings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(recording: SessionRecordingInsert & { id?: string }): Promise<SessionRecording> {
    validateFieldLimits('session_recordings', recording);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('session_recordings')
      .upsert({ ...recording, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<SessionRecordingInsert>): Promise<SessionRecording> {
    validateFieldLimits('session_recordings', patch);
    const { data, error } = await supabase
      .from('session_recordings')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('session_recordings').delete().eq('id', id);
    if (error) throw error;
  },
};

export const RecordingTracks = {
  async getByRecording(recordingId: string): Promise<RecordingTrack[]> {
    const { data, error } = await supabase
      .from('recording_tracks')
      .select('*')
      .eq('recording_id', recordingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(track: RecordingTrackInsert & { id?: string }): Promise<RecordingTrack> {
    validateFieldLimits('recording_tracks', track);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('recording_tracks')
      .upsert({ ...track, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<RecordingTrackInsert>): Promise<RecordingTrack> {
    validateFieldLimits('recording_tracks', patch);
    const { data, error } = await supabase
      .from('recording_tracks')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const RecordingChunks = {
  async getByTrack(trackId: string): Promise<RecordingChunk[]> {
    const { data, error } = await supabase
      .from('recording_chunks')
      .select('*')
      .eq('track_id', trackId)
      .order('seq', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Keyed on (track_id, seq) so a chunk re-sent after a dropped connection
  // replaces its earlier row instead of failing as a duplicate.
  async save(chunk: RecordingChunkInsert): Promise<RecordingChunk> {
    validateFieldLimits('recording_chunks', chunk);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('recording_chunks')
      .upsert({ ...chunk, user_id }, { onConflict: 'track_id,seq' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const TranscriptSegments = {
  async getByRecording(recordingId: string): Promise<TranscriptSegment[]> {
    const { data, error } = await supabase
      .from('transcript_segments')
      .select('*')
      .eq('recording_id', recordingId)
      .order('start_ms', { ascending: true });
    if (error) throw error;
    return data;
  },

  async insertMany(segments: TranscriptSegmentInsert[]): Promise<TranscriptSegment[]> {
    if (segments.length === 0) return [];
    for (const s of segments) validateFieldLimits('transcript_segments', s);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('transcript_segments')
      .insert(segments.map(s => ({ ...s, user_id })))
      .select();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<TranscriptSegmentInsert>): Promise<TranscriptSegment> {
    validateFieldLimits('transcript_segments', patch);
    const { data, error } = await supabase
      .from('transcript_segments')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Clears a track's lines before it is transcribed again.
  async deleteByTrack(trackId: string): Promise<void> {
    const { error } = await supabase.from('transcript_segments').delete().eq('track_id', trackId);
    if (error) throw error;
  },
};

export const RecordingMoments = {
  async getByRecording(recordingId: string): Promise<RecordingMoment[]> {
    const { data, error } = await supabase
      .from('recording_moments')
      .select('*')
      .eq('recording_id', recordingId)
      .order('at_ms', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(moment: RecordingMomentInsert & { id?: string }): Promise<RecordingMoment> {
    validateFieldLimits('recording_moments', moment);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('recording_moments')
      .upsert({ ...moment, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('recording_moments').delete().eq('id', id);
    if (error) throw error;
  },
};

// Discord account → PC, remembered per campaign.
export const SpeakerLinks = {
  async getAll(campaignId: string): Promise<SpeakerLink[]> {
    const { data, error } = await supabase
      .from('speaker_links')
      .select('*')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return data;
  },

  async save(link: SpeakerLinkInsert): Promise<SpeakerLink> {
    validateFieldLimits('speaker_links', link);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('speaker_links')
      .upsert({ ...link, user_id }, { onConflict: 'campaign_id,discord_user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('speaker_links').delete().eq('id', id);
    if (error) throw error;
  },
};

export const PlayerConsents = {
  async getAll(campaignId: string): Promise<PlayerConsent[]> {
    const { data, error } = await supabase
      .from('player_consents')
      .select('*')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return data;
  },

  // One row per (campaign, PC): consenting again after a withdrawal clears
  // revoked_at and restamps consented_at.
  async grant(consent: PlayerConsentInsert): Promise<PlayerConsent> {
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('player_consents')
      .upsert(
        { consented_at: new Date().toISOString(), revoked_at: null, ...consent, user_id },
        { onConflict: 'campaign_id,pc_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async revoke(id: string): Promise<PlayerConsent> {
    const { data, error } = await supabase
      .from('player_consents')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const ChronicleProposals = {
  async getByRecording(recordingId: string): Promise<ChronicleProposal[]> {
    const { data, error } = await supabase
      .from('chronicle_proposals')
      .select('*')
      .eq('recording_id', recordingId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async insertMany(proposals: ChronicleProposalInsert[]): Promise<ChronicleProposal[]> {
    if (proposals.length === 0) return [];
    for (const p of proposals) validateFieldLimits('chronicle_proposals', p);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('chronicle_proposals')
      .insert(proposals.map(p => ({ ...p, user_id })))
      .select();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<ChronicleProposalInsert>): Promise<ChronicleProposal> {
    validateFieldLimits('chronicle_proposals', patch);
    const { data, error } = await supabase
      .from('chronicle_proposals')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// Before-snapshots of changes applied from a review, so the write-back can be undone.
export const ChronicleAppliedLog = {
  async getByRecording(recordingId: string): Promise<ChronicleApplied[]> {
    const { data, error } = await supabase
      .from('chronicle_applied')
      .select('*')
      .eq('recording_id', recordingId)
      .order('applied_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async record(entry: ChronicleAppliedInsert): Promise<ChronicleApplied> {
    validateFieldLimits('chronicle_applied', entry);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('chronicle_applied')
      .insert({ ...entry, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markUndone(id: string): Promise<ChronicleApplied> {
    const { data, error } = await supabase
      .from('chronicle_applied')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// An entity's "Session History" lines.
export const EntitySessionEntries = {
  async getForEntity(entityType: SessionEntryEntityType, entityId: string): Promise<EntitySessionEntry[]> {
    const { data, error } = await supabase
      .from('entity_session_entries')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getBySession(sessionId: string): Promise<EntitySessionEntry[]> {
    const { data, error } = await supabase
      .from('entity_session_entries')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsert(entry: EntitySessionEntryInsert & { id?: string }): Promise<EntitySessionEntry> {
    validateFieldLimits('entity_session_entries', entry);
    const user_id = await getUserId();
    const { data, error } = await supabase
      .from('entity_session_entries')
      .upsert({ ...entry, user_id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('entity_session_entries').delete().eq('id', id);
    if (error) throw error;
  },
};

// --------------- Session audio (storage) ---------------
// The bucket's policies only allow a user to touch objects under their own
// `<user_id>/` folder, so every path must start with it — build paths with
// sessionAudioPath rather than by hand.

export const SESSION_AUDIO_BUCKET = 'session-audio';

export function sessionAudioPath(userId: string, recordingId: string, trackId: string, file: string): string {
  if (!userId || !recordingId || !trackId) throw new Error('sessionAudioPath: userId, recordingId and trackId are required');
  if (!file || file.includes('/') || file.includes('..')) throw new Error(`sessionAudioPath: invalid file name "${file}"`);
  return `${userId}/${recordingId}/${trackId}/${file}`;
}

export const SessionAudio = {
  // Upserts so a chunk retried after a failed upload overwrites the partial one.
  async upload(path: string, audio: Blob, contentType: string): Promise<void> {
    const { error } = await supabase.storage
      .from(SESSION_AUDIO_BUCKET)
      .upload(path, audio, { contentType, upsert: true });
    if (error) throw error;
  },

  // A short-lived link, e.g. for playback or for a speech-to-text service to fetch.
  async signedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(SESSION_AUDIO_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  },

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from(SESSION_AUDIO_BUCKET).remove(paths);
    if (error) throw error;
  },
};
