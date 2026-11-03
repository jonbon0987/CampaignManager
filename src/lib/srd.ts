// The SRD library: the System Reference Document's monsters and magic items,
// 2014 (SRD 5.1) and 2024 (SRD 5.2.1). Read-only; using an entry copies it into
// the campaign as a stat sheet or an item, so any edit stays the DM's own.
// The data is built by scripts/buildSrd.ts (sources and licences:
// src/data/srd/NOTICE.md) and loaded only when the library is first opened.

import type { ItemInsert, MonsterStatblockInsert } from './database.types';

export type SrdEdition = '2014' | '2024';

export interface SrdMonster {
  id: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  cr: string;
  xp: number;
  ac: number | null;
  acNote?: string;
  hp: number | null;
  hitDice: string;
  speed: string;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  saves?: string;
  skills?: string;
  vulnerabilities?: string;
  resistances?: string;
  immunities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  text: string;
}

export interface SrdItem {
  id: string;
  name: string;
  type: string;
  rarity: string | null;
  rarityText: string;
  attunement: boolean;
  attunementNote?: string;
  /** The item's first line: "Wondrous item, rare (requires attunement)". */
  line: string;
  text: string;
}

/** The credit the CC-BY-4.0 licence asks for, shown wherever SRD material is offered. */
export const SRD_CREDIT: Record<SrdEdition, { name: string; url: string }> = {
  '2014': { name: 'System Reference Document 5.1', url: 'https://dnd.wizards.com/resources/systems-reference-document' },
  '2024': { name: 'System Reference Document 5.2.1', url: 'https://www.dndbeyond.com/srd' },
};
export const SRD_SHORT: Record<SrdEdition, string> = { '2014': 'SRD 5.1', '2024': 'SRD 5.2.1' };

// Each file becomes its own chunk, fetched the first time it's needed.
const loaders = {
  'monsters-2014': () => import('../data/srd/monsters-2014.json'),
  'monsters-2024': () => import('../data/srd/monsters-2024.json'),
  'items-2014': () => import('../data/srd/items-2014.json'),
  'items-2024': () => import('../data/srd/items-2024.json'),
} as const;
const cache = new Map<string, Promise<unknown>>();

function load<T>(key: keyof typeof loaders): Promise<T[]> {
  if (!cache.has(key)) cache.set(key, loaders[key]().then(m => m.default));
  return cache.get(key) as Promise<T[]>;
}

export const loadSrdMonsters = (edition: SrdEdition) => load<SrdMonster>(`monsters-${edition}`);
export const loadSrdItems = (edition: SrdEdition) => load<SrdItem>(`items-${edition}`);

/** CRs in order, for the filters: "0", "1/8", "1/4", "1/2", "1" … "30". */
export const CR_ORDER = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
export const crRank = (cr: string) => CR_ORDER.indexOf(cr);

export interface MonsterFilter { q?: string; type?: string; minCr?: string; maxCr?: string }

export function filterMonsters(list: SrdMonster[], f: MonsterFilter): SrdMonster[] {
  const q = f.q?.trim().toLowerCase();
  const min = f.minCr ? crRank(f.minCr) : -1;
  const max = f.maxCr ? crRank(f.maxCr) : Infinity;
  return list.filter(m => {
    if (q && !`${m.name} ${m.type} ${m.subtype ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.type && baseType(m.type) !== f.type) return false;
    const r = crRank(m.cr);
    return r >= min && r <= max;
  });
}

export interface ItemFilter { q?: string; type?: string; rarity?: string }

export function filterItems(list: SrdItem[], f: ItemFilter): SrdItem[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter(i =>
    (!q || `${i.name} ${i.line}`.toLowerCase().includes(q))
    && (!f.type || i.type === f.type)
    && (!f.rarity || i.rarity === f.rarity));
}

const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

/** The creature type a stat sheet files it under: "swarm of tiny beasts" is a beast. */
export function baseType(type: string): string {
  const t = type.toLowerCase();
  return CREATURE_TYPES.find(c => t.includes(c)) ?? 'other';
}

/** "Small humanoid (goblinoid), neutral evil". */
export const monsterLine = (m: SrdMonster) =>
  `${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''}${m.alignment ? `, ${m.alignment}` : ''}`;

/** The stat sheet a copied SRD monster becomes. */
export function srdToStatblock(m: SrdMonster, edition: SrdEdition): Omit<MonsterStatblockInsert, 'campaign_id'> {
  const extra = m.vulnerabilities ? `Damage Vulnerabilities: ${m.vulnerabilities}\n\n` : '';
  return {
    world_id: null,
    name: m.name,
    creature_type: baseType(m.type),
    challenge_rating: m.cr,
    armor_class: m.ac,
    ac_descriptor: m.acNote ?? null,
    hit_points: m.hp,
    hit_dice: m.hitDice || null,
    speed: m.speed || null,
    str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha,
    saving_throws: m.saves ?? null,
    skills: m.skills ?? null,
    damage_immunities: m.immunities ?? null,
    damage_resistances: m.resistances ?? null,
    condition_immunities: m.conditionImmunities ?? null,
    senses: m.senses || null,
    languages: m.languages || null,
    content: `${monsterLine(m)}\n\n${extra}${m.text}`,
    dm_notes: null,
    tags: [SRD_SHORT[edition], m.size.toLowerCase(), m.subtype].filter(Boolean).join(', '),
    sort_order: 0,
  };
}

/** The item a copied SRD magic item becomes. */
export function srdToItem(i: SrdItem): Omit<ItemInsert, 'campaign_id'> {
  return {
    name: i.name,
    item_type: i.type,
    rarity: i.rarity,
    attunement: i.attunement,
    attunement_note: i.attunementNote ?? null,
    value: null,
    description: [i.line, i.text].filter(Boolean).join('\n\n') || null,
    dm_notes: null,
    image_path: null,
  };
}
