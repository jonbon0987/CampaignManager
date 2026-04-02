// src/lib/database.types.ts
// -----------------------------------------------------------
// Hand-authored types matching schema.sql.
// You can replace this with auto-generated types from the
// Supabase CLI once your project is set up:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// -----------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// --------------- Campaign ---------------

export interface Campaign {
  id: string;
  user_id: string;
  name: string;            // Short display name for the campaign list
  description: string | null;
  // Overview fields (moved from localStorage)
  title: string | null;
  plot_summary: string | null;
  major_characters: string | null;
  world_info: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CampaignInsert = Omit<Campaign, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// Join tables for linking global NPCs/Locations to campaigns
export interface CampaignNPC {
  campaign_id: string;
  npc_id: string;
  user_id: string;
  added_at: string;
}

export interface CampaignLocation {
  campaign_id: string;
  location_id: string;
  user_id: string;
  added_at: string;
}

// --------------- Row shapes (what comes back from SELECT) ---------------

export interface Session {
  id: string;
  user_id: string;
  campaign_id: string;
  session_number: number;
  session_date: string | null;       // ISO date string
  summary: string | null;
  combats: string | null;
  loot_rewards: string | null;
  hooks_notes: string | null;
  dm_notes: string | null;           // DM-only — never expose to players
  created_at: string;
  updated_at: string;
}

export interface PlayerCharacter {
  id: string;
  user_id: string;
  campaign_id: string;
  character_name: string;
  player_name: string | null;
  race: string | null;
  class: string | null;
  background: string | null;
  story_hooks: string | null;
  key_npcs: string | null;
  dm_notes: string | null;           // DM-only secrets
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NPC {
  id: string;
  user_id: string;
  campaign_id: string | null;        // NULL = global pool, non-null = campaign-specific
  name: string;
  role: string | null;
  affiliation: string | null;
  status: 'active' | 'deceased' | 'unknown';
  description: string | null;
  hooks_motivations: string | null;
  dm_notes: string | null;
  location: string | null;
  first_session: number | null;
  met_by_pcs: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  user_id: string;
  campaign_id: string | null;        // NULL = global pool, non-null = campaign-specific
  name: string;
  region: string | null;
  location_type: string | null;      // city | town | dungeon | faction_hq | landmark
  population: string | null;
  status: string | null;             // active | destroyed | unknown | compromised
  history: string | null;
  description: string | null;
  dm_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Faction {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  faction_type: string | null;
  overview: string | null;
  key_figures: string | null;
  agenda: string | null;
  dm_notes: string | null;           // hidden agendas / secrets
  created_at: string;
  updated_at: string;
}

export interface Hook {
  id: string;
  user_id: string;
  campaign_id: string;
  title: string;
  category: string | null;           // main_plot | side_quest | character_arc | faction
  description: string | null;
  last_updated_session: number | null;
  is_active: boolean;
  dm_only_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoreEntry {
  id: string;
  user_id: string;
  title: string;
  category: string | null;           // history | artifact | creature | magic | religion
  content: string | null;
  dm_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  user_id: string;
  campaign_id: string;
  chapter: string | null;
  title: string;
  synopsis: string | null;
  status: 'planned' | 'active' | 'completed';
  played_session: number | null;
  encounters: string | null;
  rewards: string | null;
  dm_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RelationshipType = 'ally' | 'rival' | 'foe' | 'neutral';
export type CharacterKind = 'pc' | 'npc';

export interface CharacterRelationship {
  id: string;
  user_id: string;
  campaign_id: string;
  from_id: string;                     // UUID of the source character
  from_kind: CharacterKind;            // 'pc' | 'npc'
  to_id: string;                       // UUID of the target character
  to_kind: CharacterKind;              // 'pc' | 'npc'
  relationship_type: RelationshipType; // 'ally' | 'rival' | 'foe' | 'neutral'
  label: string | null;                // optional short description on the edge
  created_at: string;
  updated_at: string;
}

export type CharacterRelationshipInsert = Omit<CharacterRelationship, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// --------------- Insert shapes (omit server-set fields) ---------------

export type SessionInsert = Omit<Session, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type PlayerCharacterInsert = Omit<PlayerCharacter, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type NPCInsert = Omit<NPC, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type LocationInsert = Omit<Location, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type FactionInsert = Omit<Faction, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type HookInsert = Omit<Hook, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type LoreEntryInsert = Omit<LoreEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type ModuleInsert = Omit<Module, 'id' | 'user_id' | 'created_at' | 'updated_at'>;


export interface MonsterStatblock {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  creature_type: string | null;
  challenge_rating: string | null;
  content: string | null;
  dm_notes: string | null;
  tags: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Submodule {
  id: string;
  user_id: string;
  module_id: string;
  title: string;
  submodule_type: string | null;
  summary: string | null;
  content: string | null;
  dm_notes: string | null;
  sort_order: number;
  linked_monster_ids: string | null;    // JSON array of MonsterStatblock UUIDs
  linked_encounter_ids: string | null;  // JSON array of Encounter UUIDs
  created_at: string;
  updated_at: string;
}
export interface Scene {
  id: string;
  user_id: string;
  submodule_id: string;
  title: string;
  scene_type: string | null;
  summary: string | null;
  content: string | null;
  dm_notes: string | null;
  sort_order: number;
  linked_monster_ids: string | null;  // JSON array of MonsterStatblock UUIDs
  created_at: string;
  updated_at: string;
}
export interface ModuleSheet {
  id: string;
  user_id: string;
  module_id: string;
  title: string;
  sheet_type: string | null;
  content: string | null;
  dm_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export type MonsterStatblockInsert = Omit<MonsterStatblock, "id" | "user_id" | "created_at" | "updated_at">;

// --------------- Encounter Builder ---------------

export interface EncounterCombatant {
  id: string;              // unique within the encounter
  source: 'saved' | 'custom';
  statblock_id: string | null;  // FK to monster_statblocks if source === 'saved'
  name: string;
  creature_type: string | null;
  challenge_rating: string | null;
  count: number;           // number of this creature in the encounter
  notes: string | null;
}

export interface Encounter {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  environment: string | null;   // dungeon | forest | urban | cave | open | etc.
  difficulty: string | null;    // easy | medium | hard | deadly
  party_size: number | null;
  party_level: number | null;
  combatants: string | null;    // JSON: EncounterCombatant[]
  dm_notes: string | null;
  status: 'draft' | 'ready' | 'completed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type EncounterInsert = Omit<Encounter, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SubmoduleInsert = Omit<Submodule, "id" | "user_id" | "created_at" | "updated_at">;
export type SceneInsert = Omit<Scene, "id" | "user_id" | "created_at" | "updated_at">;
export type ModuleSheetInsert = Omit<ModuleSheet, "id" | "user_id" | "created_at" | "updated_at">;

// --------------- Supabase Database type (used by createClient<Database>) ---------------

export interface Database {
  public: {
    Tables: {
      campaigns: {
        Row: Campaign;
        Insert: Omit<Campaign, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Campaign, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      campaign_npcs: {
        Row: CampaignNPC;
        Insert: Omit<CampaignNPC, 'added_at'> & { added_at?: string };
        Update: Partial<CampaignNPC>;
        Relationships: [];
      };
      campaign_locations: {
        Row: CampaignLocation;
        Insert: Omit<CampaignLocation, 'added_at'> & { added_at?: string };
        Update: Partial<CampaignLocation>;
        Relationships: [];
      };
      sessions: {
        Row: Session;
        Insert: Omit<Session, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Session, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      player_characters: {
        Row: PlayerCharacter;
        Insert: Omit<PlayerCharacter, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<PlayerCharacter, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      npcs: {
        Row: NPC;
        Insert: Omit<NPC, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NPC, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      locations: {
        Row: Location;
        Insert: Omit<Location, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Location, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      factions: {
        Row: Faction;
        Insert: Omit<Faction, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Faction, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      hooks: {
        Row: Hook;
        Insert: Omit<Hook, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Hook, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      lore_entries: {
        Row: LoreEntry;
        Insert: Omit<LoreEntry, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<LoreEntry, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      modules: {
        Row: Module;
        Insert: Omit<Module, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Module, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      character_relationships: {
        Row: CharacterRelationship;
        Insert: Omit<CharacterRelationship, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CharacterRelationship, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      submodules: {
        Row: Submodule;
        Insert: Omit<Submodule, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Submodule, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      scenes: {
        Row: Scene;
        Insert: Omit<Scene, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Scene, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      module_sheets: {
        Row: ModuleSheet;
        Insert: Omit<ModuleSheet, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ModuleSheet, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      monster_statblocks: {
        Row: MonsterStatblock;
        Insert: Omit<MonsterStatblock, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<MonsterStatblock, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      encounters: {
        Row: Encounter;
        Insert: Omit<Encounter, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Encounter, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
    };
  };
}
