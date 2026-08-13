// The assistant proposes free-form JSON that, on the campaign write path, is
// spread straight into a PostgREST upsert. Two things there can reject the whole
// commit:
//
//   1. Stray columns. The model sometimes cross-pollinates fields between entity
//      types (e.g. putting a PlayerCharacter's `key_npcs` on an NPC). PostgREST
//      rejects any key that isn't a real column ("Could not find the 'key_npcs'
//      column of 'npcs'"). We drop unknown keys, keeping only real columns.
//
//   2. Bad enum values. A few columns are closed enums; a value outside the set,
//      or the right value in the wrong case ("Active"), is rejected. We coerce
//      those to a valid value.
//
// Free-text columns (category, location_type, location status) are left as-is so
// we never discard a value the DM actually wanted.

// Columns the assistant is allowed to write, per action type. Transcribed from
// the Row interfaces in database.types.ts, minus the server-managed fields
// (user_id, created_at, updated_at). `id`, `campaign_id`, and `world_id` are
// accepted for every type since the write pipeline sets them.
const COMMON = ['id', 'campaign_id', 'world_id'];

const COLUMNS: Record<string, string[]> = {
  upsertSession: ['session_number', 'session_date', 'summary', 'combats', 'loot_rewards', 'hooks_notes', 'dm_notes'],
  upsertNPC: ['name', 'role', 'affiliation', 'status', 'description', 'hooks_motivations', 'dm_notes', 'location', 'first_session', 'met_by_pcs', 'faction_ids', 'statblock_id'],
  upsertPC: ['character_name', 'player_name', 'race', 'class', 'background', 'story_hooks', 'key_npcs', 'dm_notes', 'is_active', 'faction_ids', 'statblock_id'],
  upsertLocation: ['name', 'region', 'location_type', 'population', 'status', 'history', 'description', 'dm_notes'],
  upsertFaction: ['name', 'faction_type', 'overview', 'key_figures', 'agenda', 'dm_notes'],
  upsertHook: ['title', 'category', 'description', 'last_updated_session', 'is_active', 'dm_only_notes'],
  upsertLore: ['title', 'category', 'content', 'dm_only'],
  upsertModule: ['chapter', 'title', 'synopsis', 'status', 'played_session', 'encounters', 'rewards', 'dm_notes', 'faction_id', 'node_role'],
  upsertMonsterStatblock: ['name', 'creature_type', 'challenge_rating', 'armor_class', 'ac_descriptor', 'hit_points', 'hit_dice', 'speed', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'saving_throws', 'skills', 'damage_immunities', 'damage_resistances', 'condition_immunities', 'senses', 'languages', 'content', 'dm_notes', 'tags', 'sort_order'],
  upsertSubmodule: ['module_id', 'title', 'submodule_type', 'summary', 'content', 'dm_notes', 'sort_order', 'linked_monster_ids', 'linked_encounter_ids'],
  upsertScene: ['submodule_id', 'title', 'scene_type', 'summary', 'content', 'dm_notes', 'sort_order', 'linked_monster_ids'],
  upsertRelationship: ['from_id', 'from_kind', 'to_id', 'to_kind', 'relationship_type', 'label'],
  upsertTimelineEvent: ['title', 'description', 'year', 'display_date', 'event_type', 'era', 'sort_order'],
};

const ALLOWED: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(COLUMNS).map(([type, cols]) => [type, new Set([...COMMON, ...cols])]),
);

const NPC_STATUS = new Set(['active', 'deceased', 'unknown']);
const MODULE_STATUS = new Set(['planned', 'active', 'completed']);
const RELATIONSHIP_TYPE = new Set(['ally', 'rival', 'foe', 'neutral']);
// Timeline event_type keys the world timeline renders (TIMELINE_TYPE_CONFIG).
// 'campaign' is excluded — the world assistant seeds setting history, not
// campaign-specific markers — so those coerce down to 'custom'.
const TIMELINE_TYPE = new Set(['cataclysm', 'founding', 'treaty', 'war', 'political', 'magical', 'custom']);

/** Coerce a single field to one of `allowed` (case-insensitive), else `fallback`. */
function coerce(value: unknown, allowed: Set<string>, fallback: string): string {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (allowed.has(v)) return v;
  }
  return fallback;
}

/**
 * Return a copy of an assistant upsert payload restricted to columns that exist
 * on the target table, with closed-enum fields coerced to valid values. Enum
 * fields are only touched when present, so updates that omit them aren't forced.
 * Non-object payloads (deletes) pass through unchanged.
 */
export function normalizeAssistantPayload<T>(type: string, payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const allowed = ALLOWED[type];
  if (!allowed) return payload;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (allowed.has(key)) out[key] = value;
  }

  if (type === 'upsertNPC' && 'status' in out) {
    out.status = coerce(out.status, NPC_STATUS, 'active');
  } else if (type === 'upsertModule' && 'status' in out) {
    out.status = coerce(out.status, MODULE_STATUS, 'planned');
  } else if (type === 'upsertRelationship' && 'relationship_type' in out) {
    out.relationship_type = coerce(out.relationship_type, RELATIONSHIP_TYPE, 'neutral');
  } else if (type === 'upsertTimelineEvent' && 'event_type' in out) {
    out.event_type = coerce(out.event_type, TIMELINE_TYPE, 'custom');
  }

  return out as T;
}
