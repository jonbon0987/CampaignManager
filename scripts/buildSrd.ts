/**
 * Builds the app's SRD library (src/data/srd/*.json) from the 5e-bits
 * database's monster and magic item files, trimmed to what a stat sheet and an
 * item hold.
 *
 *   npx tsx scripts/buildSrd.ts <dir>
 *
 * <dir> holds 2014-Monsters.json, 2014-Magic-Items.json, 2024-Monsters.json and
 * 2024-Magic-Items.json, downloaded from
 * https://github.com/5e-bits/5e-srd-api/tree/main/packages/5e-database/src/<edition>/en
 * (5e-SRD-Monsters.json, 5e-SRD-Magic-Items.json). See src/data/srd/NOTICE.md
 * for the licences.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, unknown>;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'srd');

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const names = (v: unknown) => list(v).map(x => (typeof x === 'string' ? x : str((x as Json).name))).filter(Boolean).join(', ');
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function cr(n: unknown): string {
  const v = Number(n);
  return v === 0.125 ? '1/8' : v === 0.25 ? '1/4' : v === 0.5 ? '1/2' : String(v);
}

function speed(v: unknown): string {
  const s = (v ?? {}) as Json;
  const parts = Object.entries(s)
    .filter(([k]) => k !== 'hover')
    .map(([k, val]) => (k === 'walk' ? str(val) : `${k} ${str(val)}`));
  return parts.join(', ') + (s.hover ? ' (hover)' : '');
}

function senses(v: unknown): string {
  return Object.entries((v ?? {}) as Json)
    .map(([k, val]) => (k === 'passive_perception' ? `passive Perception ${val}` : `${k.replace(/_/g, ' ')} ${str(val)}`))
    .join(', ');
}

/** Saving throws and skills, from the proficiency list: "Dex +5", "Stealth +6". */
function proficiencies(v: unknown, kind: 'Saving Throw' | 'Skill'): string {
  return list(v).flatMap(p => {
    const { value, proficiency } = p as { value: number; proficiency: Json };
    const name = str(proficiency?.name);
    if (!name.startsWith(`${kind}: `)) return [];
    const what = name.slice(kind.length + 2);
    return [`${kind === 'Saving Throw' ? what[0] + what.slice(1).toLowerCase() : what} ${signed(value)}`];
  }).join(', ');
}

function armor(v: unknown): { ac: number | null; note: string } {
  const a = list(v)[0] as Json | undefined;
  if (!a) return { ac: null, note: '' };
  const type = str(a.type);
  const note = type === 'natural' ? 'natural armor'
    : type === 'armor' ? names(a.armor).toLowerCase()
    : type === 'spell' || type === 'condition' ? str(a.desc) || type
    : '';
  return { ac: typeof a.value === 'number' ? a.value : null, note };
}

/** "(Recharge 5–6)", "(3/Day)", as a stat block prints an ability's limit. */
function usage(v: unknown): string {
  const u = (v ?? {}) as Json;
  if (u.type === 'recharge on roll') return Number(u.min_value) >= 6 ? ' (Recharge 6)' : ` (Recharge ${u.min_value}–6)`;
  if (u.type === 'per day') return ` (${u.times}/Day)`;
  if (u.type === 'recharge after rest') return ` (Recharges after a ${list(u.rest_types).map(str).join(' or ')} Rest)`;
  return '';
}

/**
 * The 2024 data keeps a creature's spells apart from the text, which ends in a
 * colon; they're added back as the stat block prints them. (2014 text has them.)
 */
function spells(e: Json): string {
  const sc = e.spellcasting as Json | undefined;
  if (!sc || !str(e.desc).trim().endsWith(':')) return '';
  const groups = new Map<string, string[]>();
  for (const s of list(sc.spells) as Json[]) {
    const u = (s.usage ?? {}) as Json;
    const key = u.type === 'per day' ? `${u.times}/Day each` : 'At will';
    groups.set(key, [...(groups.get(key) ?? []), str(s.name)]);
  }
  return [...groups].map(([k, v]) => `\n${k}: ${v.join(', ')}`).join('');
}

/** Traits, actions and the rest as plain text, one block per heading. */
function blocks(m: Json): string {
  const section = (title: string, v: unknown, lead?: string) => {
    const entries = list(v) as Json[];
    if (!entries.length) return '';
    return [title, ...(lead ? [lead] : []), ...entries.map(e => `${str(e.name)}${usage(e.usage)}. ${str(e.desc)}${spells(e)}`)].join('\n');
  };
  return [
    section('Traits', m.special_abilities),
    section('Actions', m.actions),
    section('Bonus Actions', m.bonus_actions),
    section('Reactions', m.reactions),
    section('Legendary Actions', m.legendary_actions, str(m.legendary_desc) || undefined),
  ].filter(Boolean).join('\n\n');
}

function monster(m: Json) {
  const { ac, note } = armor(m.armor_class);
  return {
    id: str(m.index),
    name: str(m.name),
    size: str(m.size),
    type: str(m.type).toLowerCase(),
    subtype: str(m.subtype) || undefined,
    alignment: str(m.alignment),
    cr: cr(m.challenge_rating),
    xp: Number(m.xp) || 0,
    ac,
    acNote: note || undefined,
    hp: Number(m.hit_points) || null,
    hitDice: str(m.hit_points_roll) || str(m.hit_dice),
    speed: speed(m.speed),
    str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    saves: proficiencies(m.proficiencies, 'Saving Throw') || undefined,
    skills: proficiencies(m.proficiencies, 'Skill') || undefined,
    vulnerabilities: names(m.damage_vulnerabilities) || undefined,
    resistances: names(m.damage_resistances) || undefined,
    immunities: names(m.damage_immunities) || undefined,
    conditionImmunities: names(m.condition_immunities) || undefined,
    senses: senses(m.senses),
    languages: str(m.languages),
    text: blocks(m),
  };
}

const ITEM_TYPE: [RegExp, string][] = [
  [/^wondrous/i, 'wondrous'], [/^potion/i, 'potion'], [/^ring/i, 'ring'], [/^(weapon|ammunition)/i, 'weapon'],
  [/^armor/i, 'armor'], [/^wand/i, 'wand'], [/^staff/i, 'staff'], [/^scroll/i, 'scroll'], [/^rod/i, 'rod'],
];
const RARITY: [RegExp, string][] = [
  [/^very rare/i, 'very_rare'], [/^uncommon/i, 'uncommon'], [/^common/i, 'common'], [/^rare/i, 'rare'],
  [/^legendary/i, 'legendary'], [/^artifact/i, 'artifact'],
];

/** Paragraphs apart, but a table's rows kept together so it stays a Markdown table. */
function paragraphs(lines: string[]): string {
  return lines.reduce((out, l, i) => {
    if (i === 0) return l;
    const row = (s: string) => s.trimStart().startsWith('|');
    return out + (row(l) && row(lines[i - 1]) ? '\n' : '\n\n') + l;
  }, '');
}

function item(i: Json) {
  const desc = list(i.desc).map(str);
  const category = str((i.equipment_category as Json)?.name);
  const rarityText = str((i.rarity as Json)?.name);
  const line = desc[0] ?? '';
  const attune = line.match(/requires attunement(?: by ([^)]+))?/i);
  return {
    id: str(i.index),
    name: str(i.name),
    type: ITEM_TYPE.find(([re]) => re.test(category))?.[1] ?? 'other',
    // "Varies" or a range ("Uncommon (+1), Rare (+2)…") takes the first rarity named, else none.
    rarity: RARITY.find(([re]) => re.test(rarityText))?.[1] ?? null,
    rarityText,
    attunement: Boolean(attune) || i.attunement === true,
    attunementNote: attune?.[1] ? `by ${attune[1].trim()}` : undefined,
    line,
    text: paragraphs(desc.slice(1)),
  };
}

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npx tsx scripts/buildSrd.ts <dir with the four 5e-bits JSON files>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
for (const edition of ['2014', '2024']) {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, `${edition}-${f}.json`), 'utf8')) as Json[];
  const monsters = read('Monsters').map(monster).sort((a, b) => a.name.localeCompare(b.name));
  const items = read('Magic-Items').map(item).sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(OUT, `monsters-${edition}.json`), JSON.stringify(monsters));
  writeFileSync(join(OUT, `items-${edition}.json`), JSON.stringify(items));
  console.log(`✓ ${edition}: ${monsters.length} monsters, ${items.length} magic items`);
}
