// src/lib/database.types.ts
// -----------------------------------------------------------
// Hand-authored types matching schema.sql.
// You can replace this with auto-generated types from the
// Supabase CLI once your project is set up:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// -----------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// --------------- Row shapes (what comes back from SELECT) ---------------

export interface Session {
  id: string;
  user_id: string;
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
  from_id: string;                     // UUID of the source character
  from_kind: CharacterKind;            // 'pc' | 'npc'
  to_id: string;                       // UUID of the target character
  to_kind: CharacterKind;              // 'pc' | 'npc'
  relationship_type: RelationshipType; // 'ally' | 'rival' | 'foe' | 'neutral'
  label: string | null;                // optional short description on the edge
export interface Submodule {
  id: string;
  user_id: string;
  module_id: string;
  title: string;
  submodule_type: string | null;   // location | heist | event | social | travel | other
  summary: string | null;
  content: string | null;          // full long-form write-up
  dm_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  user_id: string;
  submodule_id: string;
  title: string;
  scene_type: string | null;       // encounter | puzzle | social | trap | exploration | other
  summary: string | null;
  content: string | null;          // full long-form write-up
  dm_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CharacterRelationshipInsert = Omit<CharacterRelationship, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export interface ModuleSheet {
  id: string;
  user_id: string;
  module_id: string;
  title: string;
  sheet_type: string | null;       // monster | npc | pc | vehicle | other
  content: string | null;          // full stat block / character sheet text
  dm_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// --------------- Insert shapes (omit server-set fields) ---------------

export type SessionInsert = Omit<Session, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type PlayerCharacterInsert = Omit<PlayerCharacter, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type NPCInsert = Omit<NPC, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type LocationInsert = Omit<Location, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type FactionInsert = Omit<Faction, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type HookInsert = Omit<Hook, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type LoreEntryInsert = Omit<LoreEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type ModuleInsert = Omit<Module, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SubmoduleInsert = Omit<Submodule, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SceneInsert = Omit<Scene, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type ModuleSheetInsert = Omit<ModuleSheet, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// --------------- Supabase Database type (used by createClient<Database>) ---------------

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: Session;
        Insert: SessionInsert & { user_id: string };
        Update: Partial<SessionInsert>;
      };
      player_characters: {
        Row: PlayerCharacter;
        Insert: PlayerCharacterInsert & { user_id: string };
        Update: Partial<PlayerCharacterInsert>;
      };
      npcs: {
        Row: NPC;
        Insert: NPCInsert & { user_id: string };
        Update: Partial<NPCInsert>;
      };
      locations: {
        Row: Location;
        Insert: LocationInsert & { user_id: string };
        Update: Partial<LocationInsert>;
      };
      factions: {
        Row: Faction;
        Insert: FactionInsert & { user_id: string };
        Update: Partial<FactionInsert>;
      };
      hooks: {
        Row: Hook;
        Insert: HookInsert & { user_id: string };
        Update: Partial<HookInsert>;
      };
      lore_entries: {
        Row: LoreEntry;
        Insert: LoreEntryInsert & { user_id: string };
        Update: Partial<LoreEntryInsert>;
      };
      modules: {
        Row: Module;
        Insert: ModuleInsert & { user_id: string };
        Update: Partial<ModuleInsert>;
      };
      character_relationships: {
        Row: CharacterRelationship;
        Insert: CharacterRelationshipInsert & { user_id: string };
        Update: Partial<CharacterRelationshipInsert>;
      submodules: {
        Row: Submodule;
        Insert: SubmoduleInsert & { user_id: string };
        Update: Partial<SubmoduleInsert>;
      };
      scenes: {
        Row: Scene;
        Insert: SceneInsert & { user_id: string };
        Update: Partial<SceneInsert>;
      };
      module_sheets: {
        Row: ModuleSheet;
        Insert: ModuleSheetInsert & { user_id: string };
        Update: Partial<ModuleSheetInsert>;
      };
    };
  };
}