// src/lib/randomEncounter.ts
// -----------------------------------------------------------
// Pure helpers for random tables: table kinds, parsing stored entries, mapping
// weights → live d100 roll odds, and rolling. Kept free of React/DB concerns so
// it can be unit-tested and shared by the campaign + world builders.
// -----------------------------------------------------------

import type { RandomEncounterEntry, RandomTableKind } from './database.types';

// The five table kinds a DM can build, with their glyph + label.
export const RANDOM_TABLE_KINDS: { key: RandomTableKind; label: string; glyph: string }[] = [
  { key: 'encounter', label: 'Encounter',  glyph: '⚔' },
  { key: 'treasure',  label: 'Treasure',   glyph: '◈' },
  { key: 'magic',     label: 'Magic Item', glyph: '❖' },
  { key: 'wild',      label: 'Wild Magic',  glyph: '✦' },
  { key: 'custom',    label: 'Custom',      glyph: '⧉' },
];

// Selectable die types — a table rolls a weighted die of this size.
export const DIE_SIZES = [4, 6, 8, 10, 12, 20, 100] as const;

const KIND_BY_KEY = new Map(RANDOM_TABLE_KINDS.map(k => [k.key, k]));

export function kindMeta(kind: string): { key: RandomTableKind; label: string; glyph: string } {
  return KIND_BY_KEY.get(kind as RandomTableKind) ?? RANDOM_TABLE_KINDS[0];
}

// Rarity is a convenience that maps to a weight (rarer → less likely). Encounter
// and Magic Item tables surface it as a select; other kinds edit weight directly.
export const RARITIES: { key: string; label: string }[] = [
  { key: 'common',   label: 'Common' },
  { key: 'uncommon', label: 'Uncommon' },
  { key: 'rare',     label: 'Rare' },
  { key: 'veryrare', label: 'Very Rare' },
];

export const RARITY_WEIGHTS: Record<string, number> = { common: 8, uncommon: 4, rare: 2, veryrare: 1 };

/** Kinds whose weight is edited via the rarity select rather than a raw number. */
export function usesRarity(kind: string): boolean {
  return kind === 'magic' || kind === 'encounter';
}

let entrySeq = 0;
/** A blank weighted entry (common → weight 8), for seeding new tables/rows. */
export function defaultRandomEntry(): RandomEncounterEntry {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${entrySeq++}`;
  return { id, name: '', description: '', weight: RARITY_WEIGHTS.common, rarity: 'common' };
}

/** Parse stored entries JSON into typed rows, tolerating malformed + legacy data. */
export function parseEntries(json: string | null | undefined): RandomEncounterEntry[] {
  if (!json) return [];
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e, i) => normalizeEntry(e, i));
  } catch {
    return [];
  }
}

// Accepts both the current shape and the earlier { min, max, result, notes }
// rows (from tables created before the weighted-kind redesign).
function normalizeEntry(e: Record<string, unknown>, i: number): RandomEncounterEntry {
  const legacyResult = typeof e.result === 'string' ? e.result : null;
  const legacyNotes = typeof e.notes === 'string' ? e.notes : null;
  const rarity = typeof e.rarity === 'string' ? e.rarity : null;
  const weight = toPosInt(
    e.weight ?? (rarity ? RARITY_WEIGHTS[rarity] : undefined) ?? rangeWidth(e),
    1,
  );
  const entryKind = e.entryKind === 'social' || e.entryKind === 'either' || e.entryKind === 'combat'
    ? e.entryKind : undefined;
  const creatures = Array.isArray(e.creatures)
    ? e.creatures
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof c.id === 'string')
        .map(c => ({ id: c.id as string, note: typeof c.note === 'string' ? c.note : null }))
    : undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
  const cardKind = e.cardKind === 'fortune' || e.cardKind === 'doom' ? e.cardKind : undefined;
  return {
    id: typeof e.id === 'string' ? e.id : `entry-${i}`,
    name: typeof e.name === 'string' ? e.name : (legacyResult ?? ''),
    description: typeof e.description === 'string' ? e.description : (legacyNotes ?? ''),
    weight,
    rarity,
    ...(entryKind ? { entryKind } : {}),
    ...(creatures ? { creatures } : {}),
    // Treasure
    ...(str(e.coins) ? { coins: str(e.coins) } : {}),
    ...(str(e.valuables) ? { valuables: str(e.valuables) } : {}),
    ...(str(e.magicItem) ? { magicItem: str(e.magicItem) } : {}),
    // Magic Item
    ...(str(e.itemType) ? { itemType: str(e.itemType) } : {}),
    ...(typeof e.attunement === 'boolean' ? { attunement: e.attunement } : {}),
    ...(str(e.itemText) ? { itemText: str(e.itemText) } : {}),
    // Wild Magic
    ...(str(e.effect) ? { effect: str(e.effect) } : {}),
    // Custom
    ...(cardKind ? { cardKind } : {}),
  };
}

function rangeWidth(e: Record<string, unknown>): number | undefined {
  const min = Number(e.min);
  const max = Number(e.max);
  if (Number.isFinite(min) && Number.isFinite(max)) return Math.max(1, max - min + 1);
  return undefined;
}

function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export interface EntryRange {
  id: string;
  lo: number;    // first die face this entry covers (inclusive)
  hi: number;    // last die face this entry covers (inclusive)
  pct: number;   // share of the roll, 0..1
}

/** Normalize a die size to a supported value, defaulting to d100. */
export function normalizeDie(dieSize: number | null | undefined): number {
  const n = Math.floor(Number(dieSize));
  return (DIE_SIZES as readonly number[]).includes(n) ? n : 100;
}

/**
 * Map entries to contiguous die ranges proportional to their weights.
 * Mirrors the prototype's `ranges()` — cumulative floor/round so the ranges
 * tile 1..dieSize without gaps.
 */
export function weightedRanges(entries: RandomEncounterEntry[], dieSize = 100): EntryRange[] {
  const die = normalizeDie(dieSize);
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0) || 1;
  let acc = 0;
  return entries.map(e => {
    const lo = Math.floor((acc / total) * die) + 1;
    acc += Math.max(0, e.weight);
    const hi = Math.round((acc / total) * die);
    return { id: e.id, lo, hi: Math.max(lo, hi), pct: Math.max(0, e.weight) / total };
  });
}

/** Roll a weighted die and resolve the entry whose range contains the roll. */
export function rollWeighted(
  entries: RandomEncounterEntry[],
  dieSize = 100,
  rng: () => number = Math.random,
): { roll: number; entry: RandomEncounterEntry | null; range: EntryRange | null } {
  const die = normalizeDie(dieSize);
  const roll = 1 + Math.floor(rng() * die);
  if (entries.length === 0) return { roll, entry: null, range: null };
  const ranges = weightedRanges(entries, die);
  const range = ranges.find(r => roll >= r.lo && roll <= r.hi) ?? ranges[ranges.length - 1];
  const entry = entries.find(e => e.id === range.id) ?? null;
  return { roll, entry, range };
}
