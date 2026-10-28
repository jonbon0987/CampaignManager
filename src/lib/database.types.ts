// src/lib/database.types.ts
// -----------------------------------------------------------
// Hand-authored types matching schema.sql.
// You can replace this with auto-generated types from the
// Supabase CLI once your project is set up:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// -----------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// --------------- World ---------------

export interface DbWorld {
  id: string;
  user_id: string;
  name: string;
  tagline: string;
  era: string;
  calendar: string;
  year: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DbWorldInsert = Omit<DbWorld, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// --------------- Campaign ---------------

export interface Campaign {
  id: string;
  user_id: string;
  world_id: string | null;       // FK to worlds — null for campaigns not yet linked
  name: string;                  // Short display name for the campaign list
  description: string | null;
  // Overview fields (moved from localStorage)
  title: string | null;
  plot_summary: string | null;
  major_characters: string | null;
  world_info: string | null;
  // World-level display fields
  party: string;
  status: 'active' | 'paused' | 'completed';
  last_played: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CampaignInsert = Omit<Campaign, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// Campaigns fetched with an embedded session count (via PostgREST select)
export type CampaignWithCount = Campaign & { session_count: number };

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

export interface SessionPrep {
  id: string;
  user_id: string;
  campaign_id: string;
  session_number: number;
  prep_date: string | null;
  notes: string | null;
  dangled_hook_ids: string[];
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
  level: number | null;
  background: string | null;
  story_hooks: string | null;
  key_npcs: string | null;
  dm_notes: string | null;           // DM-only secrets
  is_active: boolean;
  faction_ids: string[];
  statblock_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NPC {
  id: string;
  user_id: string;
  campaign_id: string | null;        // Optional FK to campaign — independent of world_id
  world_id: string | null;           // Optional FK to world — both can be set simultaneously
  name: string;
  role: string | null;
  affiliation: string | null;
  status: 'active' | 'deceased' | 'unknown';
  description: string | null;
  hooks_motivations: string | null;
  dm_notes: string | null;
  location: string | null;
  disposition: string | null;        // attitude toward the party, e.g. "Wary", "Fearful ally"
  first_session: number | null;
  met_by_pcs: boolean;
  faction_ids: string[];
  statblock_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  user_id: string;
  campaign_id: string | null;        // Optional FK to campaign — independent of world_id
  world_id: string | null;           // Optional FK to world — both can be set simultaneously
  name: string;
  region: string | null;
  location_type: string | null;      // continent | city | town | dungeon | faction_hq | landmark
  parent_id: string | null;          // self-FK — nests places into a tree (region › city › site)
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
  campaign_id: string | null;        // Optional FK to campaign — independent of world_id
  world_id: string | null;           // Optional FK to world — both can be set simultaneously
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
  category: string | null;           // kind: main_plot | side_quest | character_arc | faction
  description: string | null;
  state: string | null;              // thread lifecycle: seed | active | cold | resolved
  last_updated_session: number | null;
  is_active: boolean;
  dm_only_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Idea {
  id: string;
  user_id: string;
  campaign_id: string;
  text: string;
  tag: string | null;
  promoted_hook_id: string | null;   // set when promoted into a Thread (hook)
  created_at: string;
  updated_at: string;
}

export type IdeaInsert = Omit<Idea, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface LoreEntry {
  id: string;
  user_id: string;
  world_id: string | null;           // Optional FK to world — independent of campaign_id
  campaign_id: string | null;        // Optional FK to campaign — both can be set simultaneously
  title: string;
  category: string | null;           // history | artifact | creature | magic | religion
  content: string | null;
  dm_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  user_id: string;
  world_id: string | null;
  title: string;
  description: string | null;
  year: number;
  display_date: string;
  event_type: string;
  era: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type TimelineEventInsert = Omit<TimelineEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

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
  faction_id: string | null;            // FK to factions — colors nodes in the story web
  node_role: 'start' | 'boss' | null;   // start = opening mission, boss = final encounter
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

// --------------- Module / Submodule Dependencies ---------------

export type DependencyType = 'required' | 'optional';

export interface ModuleDependency {
  id: string;
  user_id: string;
  campaign_id: string;
  dependent_id: string;     // the module that requires something done first
  prerequisite_id: string;  // the module that must be completed first
  dependency_type: DependencyType;
  group_id: string | null;  // shared UUID for OR groups; null for required rows
  label: string | null;
  threshold: number | null; // for OR groups: require at least N prereqs completed (null/1 = any 1)
  created_at: string;
  updated_at: string;
}

export type ModuleDependencyInsert = Omit<ModuleDependency, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface SubmoduleDependency {
  id: string;
  user_id: string;
  dependent_id: string;
  prerequisite_id: string;
  dependency_type: DependencyType;
  group_id: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export type SubmoduleDependencyInsert = Omit<SubmoduleDependency, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// --------------- Insert shapes (omit server-set fields) ---------------

export type SessionInsert = Omit<Session, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SessionPrepInsert = Omit<SessionPrep, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type PlayerCharacterInsert = Omit<PlayerCharacter, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
// disposition is optional: it's written by the session-recording review, and an
// NPC save that omits it (every edit form) leaves the stored value untouched.
export type NPCInsert = Omit<NPC, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'disposition'> & { disposition?: string | null };
export type LocationInsert = Omit<Location, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type FactionInsert = Omit<Faction, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type HookInsert = Omit<Hook, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type LoreEntryInsert = Omit<LoreEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type ModuleInsert = Omit<Module, 'id' | 'user_id' | 'created_at' | 'updated_at'>;


export interface MonsterStatblock {
  id: string;
  user_id: string;
  campaign_id: string | null;        // NULL = world bestiary, non-null = campaign-specific
  world_id: string | null;           // NULL = unscoped; set for world-level bestiary entries
  name: string;
  creature_type: string | null;
  challenge_rating: string | null;
  armor_class: number | null;
  ac_descriptor: string | null;
  hit_points: number | null;
  hit_dice: string | null;
  speed: string | null;
  str: number | null;
  dex: number | null;
  con: number | null;
  int: number | null;
  wis: number | null;
  cha: number | null;
  saving_throws: string | null;
  skills: string | null;
  damage_immunities: string | null;
  damage_resistances: string | null;
  condition_immunities: string | null;
  senses: string | null;
  languages: string | null;
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
  campaign_id: string | null;   // Optional FK — null for world-level encounter templates
  world_id: string | null;      // Optional FK — set for world-level encounter templates
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

// One weighted row of a random table. Its weight maps to a slice of a d100 —
// the builder derives each entry's live % and roll range from the weights.
export interface RandomEncounterEntry {
  id: string;               // stable local id (for React keys / reordering)
  name: string;             // result name
  description: string;      // what the DM reads / paraphrases
  weight: number;           // relative weight → roll odds on d100
  rarity: string | null;    // convenience for magic/encounter kinds; maps to weight
  // Encounter-table entries only:
  entryKind?: 'combat' | 'social' | 'either';   // how a rolled encounter resolves
  creatures?: { id: string; note: string | null }[];  // linked monster_statblocks ids
  // Treasure entries:
  coins?: string;          // e.g. "4d6 × 100 gp"
  valuables?: string;      // e.g. "a jewelled reliquary (500 gp)"
  magicItem?: string;      // e.g. "a rare magic item — DM's choice"
  // Magic Item entries (rarity reuses the shared `rarity` field):
  itemType?: string;       // e.g. "Wondrous item", "Weapon (longsword)"
  attunement?: boolean;    // requires attunement
  itemText?: string;       // the item's rules text
  // Wild Magic entries:
  effect?: string;         // the surge effect text
  // Custom entries:
  cardKind?: 'fortune' | 'doom';   // present → a fortune/doom card; absent → plain read-aloud
}

// A random table's kind determines its glyph and (eventually) its roll output.
export type RandomTableKind = 'encounter' | 'treasure' | 'magic' | 'wild' | 'custom';

export interface RandomEncounterTable {
  id: string;
  user_id: string;
  campaign_id: string | null;   // set for campaign-level tables
  world_id: string | null;      // set for world-level templates
  kind: string;                 // RandomTableKind
  name: string;
  subtitle: string | null;      // one-line flavor under the title
  environment: string | null;   // region / biome the table applies to
  die_size: number;             // weighted d100
  description: string | null;
  entries: string | null;       // JSON: RandomEncounterEntry[]
  dm_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type RandomEncounterTableInsert = Omit<RandomEncounterTable, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// --------------- Session recording & transcription ---------------

export type RecordingStatus = 'recording' | 'uploading' | 'processing' | 'review' | 'applied' | 'failed' | 'cancelled';

// How the DM asked for the chronicle to be written up (session_recordings.settings).
export interface RecordingSettings {
  depth?: 'brief' | 'standard' | 'thorough';
  dropTableTalk?: boolean;      // leave out out-of-character chatter
  asidesToDmNotes?: boolean;    // the DM's asides go to dm_notes only
  keepAudioDays?: number | null; // null = keep forever, 0 = delete after review
  postRecapToDiscord?: boolean;
}

export interface SessionRecording {
  id: string;
  user_id: string;
  campaign_id: string;
  session_id: string;
  status: RecordingStatus;
  status_detail: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  settings: RecordingSettings;
  audio_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TrackSource = 'table' | 'discord' | 'upload';
export type TranscriptionStatus = 'pending' | 'submitted' | 'done' | 'failed';

export interface RecordingTrack {
  id: string;
  user_id: string;
  recording_id: string;
  source: TrackSource;
  label: string | null;
  discord_user_id: string | null;
  pc_id: string | null;
  offset_ms: number;            // track start relative to the recording start
  storage_path: string | null;  // the joined full-length file, once assembled
  mime_type: string | null;
  duration_ms: number | null;
  transcription_status: TranscriptionStatus;
  transcription_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingChunk {
  id: string;
  user_id: string;
  track_id: string;
  seq: number;
  storage_path: string;
  start_ms: number;             // relative to the track start
  duration_ms: number | null;
  byte_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  user_id: string;
  recording_id: string;
  track_id: string;
  start_ms: number;             // relative to the recording start
  end_ms: number;
  speaker_label: string | null;
  pc_id: string | null;
  is_dm: boolean;
  text: string;
  dropped_as_echo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordingMoment {
  id: string;
  user_id: string;
  recording_id: string;
  at_ms: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpeakerLink {
  id: string;
  user_id: string;
  campaign_id: string;
  discord_user_id: string;
  discord_username: string | null;
  pc_id: string | null;
  is_dm: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayerConsent {
  id: string;
  user_id: string;
  campaign_id: string;
  pc_id: string;
  consented_at: string;
  method: 'in_person' | 'discord' | 'other' | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalStatus = 'pending' | 'accepted' | 'skipped' | 'applied';

export interface ChronicleProposal {
  id: string;
  user_id: string;
  recording_id: string;
  campaign_id: string;
  group_key: string;
  action: Record<string, unknown>;        // ImportAction shape (src/lib/documentImport.ts)
  edits: Record<string, unknown> | null;  // the DM's overrides, applied over `action`
  status: ProposalStatus;
  source_ms: number | null;
  source_quote: string | null;
  source_speaker: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChronicleApplied {
  id: string;
  user_id: string;
  recording_id: string;
  proposal_id: string | null;
  entity_table: string;
  entity_id: string;
  operation: 'create' | 'update';
  before: Record<string, unknown> | null; // row before the update; null for a create
  applied_at: string;
  undone_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionEntryEntityType = 'pc' | 'npc' | 'location' | 'faction' | 'lore' | 'hook';

export interface EntitySessionEntry {
  id: string;
  user_id: string;
  campaign_id: string;
  session_id: string;
  recording_id: string | null;
  entity_type: SessionEntryEntityType;
  entity_id: string;
  text: string;
  source_ms: number | null;
  source_quote: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionRecordingInsert = Omit<SessionRecording, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status' | 'started_at' | 'settings'>
  & Partial<Pick<SessionRecording, 'status' | 'started_at' | 'settings'>>;
export type RecordingTrackInsert = Omit<RecordingTrack, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'offset_ms' | 'transcription_status'>
  & Partial<Pick<RecordingTrack, 'offset_ms' | 'transcription_status'>>;
export type RecordingChunkInsert = Omit<RecordingChunk, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type TranscriptSegmentInsert = Omit<TranscriptSegment, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type RecordingMomentInsert = Omit<RecordingMoment, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SpeakerLinkInsert = Omit<SpeakerLink, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type PlayerConsentInsert = Omit<PlayerConsent, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'consented_at' | 'revoked_at'>
  & Partial<Pick<PlayerConsent, 'consented_at' | 'revoked_at'>>;
export type ChronicleProposalInsert = Omit<ChronicleProposal, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status' | 'edits'>
  & Partial<Pick<ChronicleProposal, 'status' | 'edits'>>;
export type ChronicleAppliedInsert = Omit<ChronicleApplied, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'applied_at' | 'undone_at'>;
export type EntitySessionEntryInsert = Omit<EntitySessionEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SubmoduleInsert = Omit<Submodule, "id" | "user_id" | "created_at" | "updated_at">;
export type SceneInsert = Omit<Scene, "id" | "user_id" | "created_at" | "updated_at">;
export type ModuleSheetInsert = Omit<ModuleSheet, "id" | "user_id" | "created_at" | "updated_at">;

// --------------- Supabase Database type (used by createClient<Database>) ---------------

export interface Database {
  public: {
    Tables: {
      worlds: {
        Row: DbWorld;
        Insert: Omit<DbWorld, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbWorld, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
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
      ideas: {
        Row: Idea;
        Insert: Omit<Idea, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Idea, 'id' | 'created_at' | 'updated_at'>>;
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
      random_encounter_tables: {
        Row: RandomEncounterTable;
        Insert: Omit<RandomEncounterTable, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<RandomEncounterTable, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      session_recordings: {
        Row: SessionRecording;
        Insert: SessionRecordingInsert & { id?: string; user_id: string };
        Update: Partial<Omit<SessionRecording, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      recording_tracks: {
        Row: RecordingTrack;
        Insert: RecordingTrackInsert & { id?: string; user_id: string };
        Update: Partial<Omit<RecordingTrack, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      recording_chunks: {
        Row: RecordingChunk;
        Insert: RecordingChunkInsert & { id?: string; user_id: string };
        Update: Partial<Omit<RecordingChunk, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      transcript_segments: {
        Row: TranscriptSegment;
        Insert: TranscriptSegmentInsert & { id?: string; user_id: string };
        Update: Partial<Omit<TranscriptSegment, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      recording_moments: {
        Row: RecordingMoment;
        Insert: RecordingMomentInsert & { id?: string; user_id: string };
        Update: Partial<Omit<RecordingMoment, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      speaker_links: {
        Row: SpeakerLink;
        Insert: SpeakerLinkInsert & { id?: string; user_id: string };
        Update: Partial<Omit<SpeakerLink, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      player_consents: {
        Row: PlayerConsent;
        Insert: PlayerConsentInsert & { id?: string; user_id: string };
        Update: Partial<Omit<PlayerConsent, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      chronicle_proposals: {
        Row: ChronicleProposal;
        Insert: ChronicleProposalInsert & { id?: string; user_id: string };
        Update: Partial<Omit<ChronicleProposal, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      chronicle_applied: {
        Row: ChronicleApplied;
        Insert: ChronicleAppliedInsert & { id?: string; user_id: string };
        Update: Partial<Omit<ChronicleApplied, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      entity_session_entries: {
        Row: EntitySessionEntry;
        Insert: EntitySessionEntryInsert & { id?: string; user_id: string };
        Update: Partial<Omit<EntitySessionEntry, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
    };
  };
}
