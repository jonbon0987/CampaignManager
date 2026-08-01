// Pure transforms for the AI encounter generator (see GenerateEncounterModal).
//
// Kept free of React / network / campaign-context so the tricky bits — mapping
// an AI creature onto a stat-sheet insert and resolving the combatant roster
// against existing + newly-created creatures — are unit-testable in isolation.

import type { EncounterCombatant, MonsterStatblockInsert } from './database.types';

export function toIntOrNull(v: unknown): number | null {
  const n = parseInt(String(v ?? '').trim(), 10);
  return isNaN(n) ? null : n;
}

// Minimal shape needed to link a combatant back to a saved stat sheet.
export interface ResolvableCreature {
  id: string;
  name: string;
  creature_type: string | null;
  challenge_rating: string | null;
}

// One entry in the AI response's "combatants" array (all fields untrusted).
export interface RawCombatant {
  name?: unknown;
  count?: unknown;
  notes?: unknown;
}

// Map one AI creature object onto a stat-sheet insert. campaign_id is added by
// the campaign context at save time, so it is omitted here.
export function creatureToInsert(
  c: Record<string, unknown>,
  sortOrder: number,
): Omit<MonsterStatblockInsert, 'campaign_id'> {
  return {
    world_id: null,
    name: String(c.name ?? 'Unnamed Creature'),
    creature_type: c.creature_type ? String(c.creature_type) : null,
    challenge_rating: c.challenge_rating != null ? String(c.challenge_rating) : null,
    armor_class: toIntOrNull(c.armor_class),
    ac_descriptor: c.ac_descriptor ? String(c.ac_descriptor) : null,
    hit_points: toIntOrNull(c.hit_points),
    hit_dice: c.hit_dice ? String(c.hit_dice) : null,
    speed: c.speed ? String(c.speed) : null,
    str: toIntOrNull(c.str),
    dex: toIntOrNull(c.dex),
    con: toIntOrNull(c.con),
    int: toIntOrNull(c.int),
    wis: toIntOrNull(c.wis),
    cha: toIntOrNull(c.cha),
    saving_throws: c.saving_throws ? String(c.saving_throws) : null,
    skills: c.skills ? String(c.skills) : null,
    damage_immunities: c.damage_immunities ? String(c.damage_immunities) : null,
    damage_resistances: c.damage_resistances ? String(c.damage_resistances) : null,
    condition_immunities: c.condition_immunities ? String(c.condition_immunities) : null,
    senses: c.senses ? String(c.senses) : null,
    languages: c.languages ? String(c.languages) : null,
    content: c.content ? String(c.content) : null,
    dm_notes: c.dm_notes ? String(c.dm_notes) : null,
    tags: c.tags ? String(c.tags) : null,
    sort_order: sortOrder,
  };
}

// Resolve the AI's combatant list into encounter combatants. A combatant whose
// name matches a newly-created creature (preferred) or an existing library
// creature is linked to that saved stat sheet; anything unmatched becomes a
// lightweight custom combatant. Names are matched case-insensitively.
export function resolveCombatants(
  raw: unknown,
  newCreatures: ResolvableCreature[],
  library: ResolvableCreature[],
): EncounterCombatant[] {
  const index = (list: ResolvableCreature[]) =>
    new Map(list.map(c => [c.name.trim().toLowerCase(), c]));
  const newByName = index(newCreatures);
  const libByName = index(library);

  const rows = Array.isArray(raw) ? (raw as RawCombatant[]) : [];
  return rows
    .filter(c => c && String(c.name ?? '').trim())
    .map(c => {
      const name = String(c.name).trim();
      const key = name.toLowerCase();
      const match = newByName.get(key) ?? libByName.get(key) ?? null;
      const count = Math.max(1, toIntOrNull(c.count) ?? 1);
      const notes = c.notes != null && String(c.notes).trim() ? String(c.notes).trim() : null;

      if (match) {
        return {
          id: crypto.randomUUID(),
          source: 'saved',
          statblock_id: match.id,
          name: match.name,
          creature_type: match.creature_type,
          challenge_rating: match.challenge_rating,
          count,
          notes,
        } satisfies EncounterCombatant;
      }
      return {
        id: crypto.randomUUID(),
        source: 'custom',
        statblock_id: null,
        name,
        creature_type: null,
        challenge_rating: null,
        count,
        notes,
      } satisfies EncounterCombatant;
    });
}

// Keep the AI's difficulty only if it is one of the allowed values.
export function pickDifficulty(value: unknown, fallback: string, valid: readonly string[]): string {
  return typeof value === 'string' && valid.includes(value) ? value : fallback;
}
