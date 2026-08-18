// src/lib/fieldLimits.ts
// -----------------------------------------------------------
// Single source of truth for per-field length/range limits.
//
// These values are enforced in THREE places, which must stay in sync:
//   1. Client inputs   — `maxLength` + live counters (see limitFor / rangeFor)
//   2. Write layer     — validateFieldLimits() runs in every db.ts upsert,
//                        catching manual, AI-generated, and imported writes
//                        with a friendly message (surfaced via toast).
//   3. Database        — CHECK constraints in
//                        migrations/0028_field_length_constraints.sql, which is
//                        GENERATED from this file. After changing a limit here,
//                        regenerate it: `npm run migrate:gen-constraints`
//                        (CI can verify with `-- --check`). Never hand-edit the
//                        migration.
// -----------------------------------------------------------

/** Length tiers. Every text column maps to exactly one of these. */
export const LIMIT = {
  /** Enum-ish single tokens: status, type, category, tag. */
  TAG: 60,
  /** Short names / titles / short descriptors. */
  NAME: 120,
  /** One-line taglines and edge labels. */
  TAGLINE: 240,
  /** Stat lines: comma-separated senses, skills, immunities, etc. */
  STATLINE: 500,
  /** Prose blocks: descriptions, notes, agendas, hooks. */
  PROSE: 8_000,
  /** Long document bodies: markdown content, module/session bodies. */
  BODY: 40_000,
} as const;

/**
 * Per-table text column → max character length.
 * Columns not listed here (ids, FKs, timestamps, JSON blobs) are unconstrained.
 */
export const TEXT_LIMITS: Record<string, Record<string, number>> = {
  worlds: {
    name: LIMIT.NAME,
    tagline: LIMIT.TAGLINE,
    era: LIMIT.NAME,
    calendar: LIMIT.NAME,
  },
  campaigns: {
    name: LIMIT.NAME,
    description: LIMIT.PROSE,
    title: LIMIT.NAME,
    plot_summary: LIMIT.PROSE,
    major_characters: LIMIT.PROSE,
    world_info: LIMIT.PROSE,
    party: LIMIT.TAGLINE,
    last_played: LIMIT.NAME,
  },
  sessions: {
    summary: LIMIT.BODY,
    combats: LIMIT.BODY,
    loot_rewards: LIMIT.BODY,
    hooks_notes: LIMIT.PROSE,
    dm_notes: LIMIT.BODY,
  },
  session_prep: {
    notes: LIMIT.BODY,
  },
  player_characters: {
    character_name: LIMIT.NAME,
    player_name: LIMIT.NAME,
    race: LIMIT.NAME,
    class: LIMIT.NAME,
    background: LIMIT.PROSE, // free-form history prose (edited via SlashField), not the 5e label
    story_hooks: LIMIT.PROSE,
    key_npcs: LIMIT.PROSE,
    dm_notes: LIMIT.PROSE,
  },
  npcs: {
    name: LIMIT.NAME,
    role: LIMIT.NAME,
    affiliation: LIMIT.NAME,
    description: LIMIT.PROSE,
    hooks_motivations: LIMIT.PROSE,
    dm_notes: LIMIT.PROSE,
    location: LIMIT.NAME,
  },
  locations: {
    name: LIMIT.NAME,
    region: LIMIT.NAME,
    location_type: LIMIT.TAG,
    population: LIMIT.NAME,
    status: LIMIT.TAG,
    history: LIMIT.PROSE,
    description: LIMIT.PROSE,
    dm_notes: LIMIT.PROSE,
  },
  factions: {
    name: LIMIT.NAME,
    faction_type: LIMIT.TAG,
    overview: LIMIT.PROSE,
    key_figures: LIMIT.PROSE,
    agenda: LIMIT.PROSE,
    dm_notes: LIMIT.PROSE,
  },
  hooks: {
    title: LIMIT.NAME,
    category: LIMIT.TAG,
    description: LIMIT.PROSE,
    state: LIMIT.TAG,
    dm_only_notes: LIMIT.PROSE,
  },
  ideas: {
    text: LIMIT.PROSE,
    tag: LIMIT.TAG,
  },
  lore_entries: {
    title: LIMIT.NAME,
    category: LIMIT.TAG,
    content: LIMIT.BODY,
  },
  timeline_events: {
    title: LIMIT.NAME,
    description: LIMIT.PROSE,
    display_date: LIMIT.NAME,
    event_type: LIMIT.TAG,
    era: LIMIT.NAME,
  },
  modules: {
    chapter: LIMIT.TAG,
    title: LIMIT.NAME,
    synopsis: LIMIT.PROSE,
    encounters: LIMIT.BODY,
    rewards: LIMIT.BODY,
    dm_notes: LIMIT.BODY,
  },
  character_relationships: {
    label: LIMIT.TAGLINE,
  },
  submodules: {
    title: LIMIT.NAME,
    submodule_type: LIMIT.TAG,
    summary: LIMIT.PROSE,
    content: LIMIT.BODY,
    dm_notes: LIMIT.BODY,
  },
  scenes: {
    title: LIMIT.NAME,
    scene_type: LIMIT.TAG,
    summary: LIMIT.PROSE,
    content: LIMIT.BODY,
    dm_notes: LIMIT.BODY,
  },
  module_sheets: {
    title: LIMIT.NAME,
    sheet_type: LIMIT.TAG,
    content: LIMIT.BODY,
    dm_notes: LIMIT.BODY,
  },
  monster_statblocks: {
    name: LIMIT.NAME,
    creature_type: LIMIT.TAG,
    challenge_rating: LIMIT.NAME,
    ac_descriptor: LIMIT.NAME,
    hit_dice: LIMIT.NAME,
    speed: LIMIT.NAME,
    saving_throws: LIMIT.STATLINE,
    skills: LIMIT.STATLINE,
    damage_immunities: LIMIT.STATLINE,
    damage_resistances: LIMIT.STATLINE,
    condition_immunities: LIMIT.STATLINE,
    senses: LIMIT.STATLINE,
    languages: LIMIT.STATLINE,
    content: LIMIT.BODY,
    dm_notes: LIMIT.PROSE,
    tags: LIMIT.STATLINE,
  },
  encounters: {
    name: LIMIT.NAME,
    description: LIMIT.PROSE,
    environment: LIMIT.TAG,
    difficulty: LIMIT.TAG,
    dm_notes: LIMIT.PROSE,
  },
  random_encounter_tables: {
    name: LIMIT.NAME,
    subtitle: LIMIT.TAGLINE,
    environment: LIMIT.TAG,
    description: LIMIT.PROSE,
    dm_notes: LIMIT.PROSE,
  },
  module_dependencies: {
    label: LIMIT.TAGLINE,
  },
  submodule_dependencies: {
    label: LIMIT.TAGLINE,
  },
};

/**
 * Per-table numeric column → [min, max] inclusive range.
 * Applied to number-typed inputs and validated on write.
 */
export const NUMBER_RANGES: Record<string, Record<string, [number, number]>> = {
  worlds: {
    year: [-99_999, 99_999],
  },
  sessions: {
    session_number: [0, 9_999],
  },
  session_prep: {
    session_number: [0, 9_999],
  },
  player_characters: {
    level: [1, 20],
  },
  npcs: {
    first_session: [0, 9_999],
  },
  hooks: {
    last_updated_session: [0, 9_999],
  },
  modules: {
    played_session: [0, 9_999],
  },
  timeline_events: {
    year: [-99_999, 99_999],
  },
  monster_statblocks: {
    armor_class: [0, 99],
    hit_points: [0, 99_999],
    str: [1, 99],
    dex: [1, 99],
    con: [1, 99],
    int: [1, 99],
    wis: [1, 99],
    cha: [1, 99],
  },
  encounters: {
    party_size: [1, 99],
    party_level: [1, 99],
  },
};

/** Max character length for a given table.column, or undefined if unconstrained. */
export function limitFor(table: string, column: string): number | undefined {
  return TEXT_LIMITS[table]?.[column];
}

/** [min, max] range for a numeric table.column, or undefined if unconstrained. */
export function rangeFor(table: string, column: string): [number, number] | undefined {
  return NUMBER_RANGES[table]?.[column];
}

/** Minimum for a numeric table.column, or undefined — ergonomic for `<input min>`. */
export function minFor(table: string, column: string): number | undefined {
  return NUMBER_RANGES[table]?.[column]?.[0];
}

/** Maximum for a numeric table.column, or undefined — ergonomic for `<input max>`. */
export function maxFor(table: string, column: string): number | undefined {
  return NUMBER_RANGES[table]?.[column]?.[1];
}

/** Human-friendly label for a column, e.g. "dm_notes" → "DM notes". */
export function fieldLabel(column: string): string {
  if (column === 'dm_notes' || column === 'dm_only_notes') return 'DM notes';
  const words = column.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Thrown when a value violates its configured limit. Message is user-facing. */
export class FieldLimitError extends Error {
  table: string;
  column: string;

  constructor(table: string, column: string, message: string) {
    super(message);
    this.name = 'FieldLimitError';
    this.table = table;
    this.column = column;
  }
}

/**
 * Validate an insert/update payload against the configured limits for `table`.
 * Throws FieldLimitError (user-facing message) on the first violation.
 * No-op for tables/columns without configured limits.
 */
export function validateFieldLimits(table: string, data: Record<string, unknown>): void {
  const textLimits = TEXT_LIMITS[table];
  if (textLimits) {
    for (const [column, max] of Object.entries(textLimits)) {
      const value = data[column];
      if (typeof value === 'string' && value.length > max) {
        throw new FieldLimitError(
          table,
          column,
          `${fieldLabel(column)} is too long (${value.length.toLocaleString()} / ${max.toLocaleString()} characters). Please shorten it.`,
        );
      }
    }
  }

  const ranges = NUMBER_RANGES[table];
  if (ranges) {
    for (const [column, [min, max]] of Object.entries(ranges)) {
      const value = data[column];
      if (typeof value === 'number' && Number.isFinite(value) && (value < min || value > max)) {
        throw new FieldLimitError(
          table,
          column,
          `${fieldLabel(column)} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`,
        );
      }
    }
  }
}
