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
//
// Numbers off a character sheet are read from text ("15") and kept inside the
// ranges the database allows, so one stray value doesn't sink the whole card.

import { NUMBER_RANGES } from './fieldLimits';
import { ITEM_TYPES, RARITIES } from './items';

// Columns the assistant is allowed to write, per action type. Transcribed from
// the Row interfaces in database.types.ts, minus the server-managed fields
// (user_id, created_at, updated_at). `id`, `campaign_id`, and `world_id` are
// accepted for every type since the write pipeline sets them.
const COMMON = ['id', 'campaign_id', 'world_id'];

const PC_NUMBERS = ['level', 'max_hp', 'armor_class', 'passive_perception', 'passive_insight', 'passive_investigation', 'spell_save_dc', 'xp'];

const COLUMNS: Record<string, string[]> = {
  upsertSession: ['session_number', 'session_date', 'session_time', 'title', 'status', 'summary', 'combats', 'loot_rewards', 'hooks_notes', 'dm_notes', 'prep_notes', 'plan'],
  upsertNPC: ['name', 'role', 'affiliation', 'status', 'disposition', 'description', 'hooks_motivations', 'dm_notes', 'location', 'location_id', 'first_session', 'met_by_pcs', 'faction_ids', 'statblock_id'],
  upsertPC: ['character_name', 'player_name', 'race', 'class', 'background', 'story_hooks', 'key_npcs', 'key_npc_ids', 'dm_notes', 'is_active', 'faction_ids', 'statblock_id', ...PC_NUMBERS, 'sheet_url'],
  upsertLocation: ['name', 'region', 'location_type', 'parent_id', 'population', 'status', 'history', 'description', 'read_aloud', 'dm_notes'],
  upsertFaction: ['name', 'faction_type', 'overview', 'key_figures', 'key_figure_ids', 'agenda', 'dm_notes'],
  upsertHook: ['title', 'category', 'description', 'state', 'last_updated_session', 'is_active', 'dm_only_notes', 'clock_size', 'clock_filled', 'clock_label', 'npc_ids', 'location_ids', 'faction_ids', 'module_id', 'player_text'],
  upsertLore: ['title', 'category', 'content', 'dm_only'],
  upsertModule: ['chapter', 'title', 'synopsis', 'status', 'played_session', 'encounters', 'rewards', 'dm_notes', 'faction_id', 'node_role'],
  upsertMonsterStatblock: ['name', 'creature_type', 'challenge_rating', 'armor_class', 'ac_descriptor', 'hit_points', 'hit_dice', 'speed', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'saving_throws', 'skills', 'damage_immunities', 'damage_resistances', 'condition_immunities', 'senses', 'languages', 'content', 'dm_notes', 'tags', 'sort_order'],
  upsertSubmodule: ['module_id', 'title', 'submodule_type', 'summary', 'content', 'dm_notes', 'sort_order', 'linked_monster_ids', 'linked_encounter_ids'],
  upsertScene: ['submodule_id', 'title', 'scene_type', 'summary', 'content', 'read_aloud', 'dm_notes', 'sort_order', 'linked_monster_ids'],
  upsertRelationship: ['from_id', 'from_kind', 'to_id', 'to_kind', 'relationship_type', 'label'],
  upsertTimelineEvent: ['title', 'description', 'year', 'display_date', 'event_type', 'era', 'sort_order'],
  // `holders` isn't a column: the write path turns it into the item's holdings.
  upsertItem: ['name', 'item_type', 'rarity', 'attunement', 'attunement_note', 'value', 'description', 'dm_notes', 'holders'],
  addTreasury: ['cp', 'sp', 'ep', 'gp', 'pp', 'note', 'pc_id', 'session_id'],
  upsertHouseRule: ['topic', 'title', 'text'],
  updateCampaign: ['rules_edition', 'levelling', 'session_repeat', 'world_date'],
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
// The assistant never starts a session: Play does. 'live' is left out, so a
// session already being played keeps that status through an update.
const SESSION_STATUS = new Map([['planned', 'planned'], ['upcoming', 'planned'], ['next', 'planned'], ['done', 'done'], ['played', 'done'], ['completed', 'done'], ['complete', 'done']]);

/** A number for a column with a range: read from text, rounded and clamped. Undefined when it isn't a number. */
function inRange(value: unknown, range: [number, number] | undefined): number | null | undefined {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseInt(value.replace(/,/g, ''), 10) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  return range ? Math.min(range[1], Math.max(range[0], r)) : r;
}

/** One of `options`, matched on its id or its label (case-insensitive, spaces or underscores). */
function option(value: unknown, options: { id: string; label: string }[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return options.find(o => o.id === v || o.label.toLowerCase().replace(/[\s-]+/g, '_') === v)?.id;
}

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
  } else if (type === 'upsertPC') {
    for (const key of PC_NUMBERS) {
      if (!(key in out)) continue;
      const n = inRange(out[key], NUMBER_RANGES.player_characters[key]);
      if (n === undefined) delete out[key];
      else out[key] = n;
    }
    // The column only takes a web link; anything else would fail the whole save.
    if ('sheet_url' in out && out.sheet_url !== null) {
      const url = typeof out.sheet_url === 'string' ? out.sheet_url.trim() : '';
      if (/^https?:\/\/\S+$/i.test(url)) out.sheet_url = url;
      else delete out.sheet_url;
    }
  } else if (type === 'upsertSession' && 'status' in out) {
    const status = typeof out.status === 'string' ? SESSION_STATUS.get(out.status.trim().toLowerCase()) : undefined;
    if (status) out.status = status;
    else delete out.status;
  } else if (type === 'upsertItem') {
    if ('item_type' in out && out.item_type !== null) out.item_type = option(out.item_type, ITEM_TYPES) ?? 'other';
    // No rarity means the item isn't magic: "none" or "mundane" reads that way too.
    if ('rarity' in out && out.rarity !== null) out.rarity = option(out.rarity, RARITIES) ?? null;
    if ('attunement' in out) out.attunement = out.attunement === true || out.attunement === 'true';
  } else if (type === 'addTreasury') {
    // A ledger line is only ever added; it has no id of its own to send.
    delete out.id;
  }

  return out as T;
}
