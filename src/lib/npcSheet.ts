// An NPC from a character sheet: the NPC's own fields (who they are) and a stat
// sheet built from the sheet's numbers (what they fight with), which the NPC
// links to so it runs in the initiative tracker. Fillable sheets are read from
// their form fields here; anything else (including a monster-style stat block)
// comes back from the assistant in the same shape (cleanNpcSheet).

import type { NPC } from './database.types';
import type { StatSheetFields } from './statblockCompletion';
import { parsedToMonsterForm, statblockFieldsFromForm } from './statblockCompletion';
import { emptyMonsterForm } from './statblocks';
import {
  diffValues, fieldLookup, fromFormFields, parseNumber, sameName, type FieldChange,
} from './characterSheet';

export type NpcSheetValues = Partial<Pick<NPC, 'name' | 'role' | 'description' | 'hooks_motivations'>>;
export type StatSheetValues = Partial<StatSheetFields>;
export interface NpcSheet { npc: NpcSheetValues; statblock: StatSheetValues }

export const NPC_GROUP = 'npc';
export const STATBLOCK_GROUP = 'statblock';

export const NPC_SHEET_FIELDS: { key: keyof NpcSheetValues; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'description', label: 'Description' },
  { key: 'hooks_motivations', label: 'Hooks & motivations' },
];

export const STATBLOCK_SHEET_FIELDS: { key: keyof StatSheetFields; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'creature_type', label: 'Type' },
  { key: 'challenge_rating', label: 'CR' },
  { key: 'armor_class', label: 'AC' },
  { key: 'ac_descriptor', label: 'AC note' },
  { key: 'hit_points', label: 'Hit points' },
  { key: 'hit_dice', label: 'Hit dice' },
  { key: 'speed', label: 'Speed' },
  { key: 'str', label: 'Str' }, { key: 'dex', label: 'Dex' }, { key: 'con', label: 'Con' },
  { key: 'int', label: 'Int' }, { key: 'wis', label: 'Wis' }, { key: 'cha', label: 'Cha' },
  { key: 'saving_throws', label: 'Saving throws' },
  { key: 'skills', label: 'Skills' },
  { key: 'damage_resistances', label: 'Resistances' },
  { key: 'damage_immunities', label: 'Immunities' },
  { key: 'condition_immunities', label: 'Condition immunities' },
  { key: 'senses', label: 'Senses' },
  { key: 'languages', label: 'Languages' },
  { key: 'content', label: 'Actions & traits' },
];

const ABILITIES = [
  { key: 'str', label: 'Str', names: ['str', 'strength'], save: ['ststrength'] },
  { key: 'dex', label: 'Dex', names: ['dex', 'dexterity'], save: ['stdexterity'] },
  { key: 'con', label: 'Con', names: ['con', 'constitution'], save: ['stconstitution'] },
  { key: 'int', label: 'Int', names: ['int', 'intelligence'], save: ['stintelligence'] },
  { key: 'wis', label: 'Wis', names: ['wis', 'wisdom'], save: ['stwisdom'] },
  { key: 'cha', label: 'Cha', names: ['cha', 'charisma'], save: ['stcharisma'] },
] as const;
type Ability = typeof ABILITIES[number]['key'];

const SKILLS: { label: string; names: string[]; ability: Ability }[] = [
  { label: 'Acrobatics', names: ['acrobatics'], ability: 'dex' },
  { label: 'Animal Handling', names: ['animal', 'animalhandling'], ability: 'wis' },
  { label: 'Arcana', names: ['arcana'], ability: 'int' },
  { label: 'Athletics', names: ['athletics'], ability: 'str' },
  { label: 'Deception', names: ['deception'], ability: 'cha' },
  { label: 'History', names: ['history'], ability: 'int' },
  { label: 'Insight', names: ['insight'], ability: 'wis' },
  { label: 'Intimidation', names: ['intimidation'], ability: 'cha' },
  { label: 'Investigation', names: ['investigation'], ability: 'int' },
  { label: 'Medicine', names: ['medicine'], ability: 'wis' },
  { label: 'Nature', names: ['nature'], ability: 'int' },
  { label: 'Perception', names: ['perception'], ability: 'wis' },
  { label: 'Performance', names: ['performance'], ability: 'cha' },
  { label: 'Persuasion', names: ['persuasion'], ability: 'cha' },
  { label: 'Religion', names: ['religion'], ability: 'int' },
  { label: 'Sleight of Hand', names: ['sleightofhand'], ability: 'dex' },
  { label: 'Stealth', names: ['stealth'], ability: 'dex' },
  { label: 'Survival', names: ['survival'], ability: 'wis' },
];

const mod = (score: number) => Math.floor((score - 10) / 2);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const para = (label: string, text: string | null) => (text ? `**${label}.** ${text}` : null);

/** The text under "=== LANGUAGES ===" in D&D Beyond's proficiencies box. */
function languagesFrom(proficiencies: string | null): string | null {
  if (!proficiencies) return null;
  const m = /===\s*LANGUAGES\s*===\s*([\s\S]*?)(?:===|$)/i.exec(proficiencies);
  if (!m) return null;
  const list = m[1].split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  return list || null;
}

/** The weapon rows: "Battleaxe. +8 to hit, 1d8+7 Slashing. Martial, Versatile." */
function attacksFrom(first: (names: readonly string[]) => string | null): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const name = first(i === 1 ? ['wpnname', 'wpnname1', 'wpn1name'] : [`wpnname${i}`, `wpn${i}name`]);
    if (!name) continue;
    const hit = first([`wpn${i}atkbonus`, `wpnatkbonus${i}`]);
    const damage = first([`wpn${i}damage`, `wpndamage${i}`]);
    const notes = first([`wpnnotes${i}`, `wpn${i}notes`]);
    const parts = [hit ? `${hit.startsWith('+') || hit.startsWith('-') ? hit : `+${hit}`} to hit` : null, damage].filter(Boolean).join(', ');
    out.push(`${name}.${parts ? ` ${parts}.` : ''}${notes ? ` ${notes.replace(/\.$/, '')}.` : ''}`);
  }
  return out;
}

/** An NPC and its stat sheet from a fillable sheet's form fields. */
export function npcFromFormFields(fields: Record<string, string>): NpcSheet {
  const first = fieldLookup(fields);
  const pc = fromFormFields(fields);

  // Who they are.
  const who = [pc.race, pc.class && pc.level && !/\d/.test(pc.class) ? `${pc.class} ${pc.level}` : pc.class].filter(Boolean).join(' ');
  const description = [
    para('Appearance', first(['appearance', 'characterappearance'])),
    para('Backstory', first(['backstory', 'characterbackstory'])),
    para('Allies & organizations', first(['alliesorganizations', 'allies', 'factionname'])),
  ].filter(Boolean).join('\n\n');
  const npc: NpcSheetValues = {
    name: pc.character_name ?? undefined,
    role: who || undefined,
    description: description || undefined,
    hooks_motivations: pc.story_hooks ?? undefined,
  };

  // What they fight with.
  const scores: Partial<Record<Ability, number>> = {};
  for (const a of ABILITIES) {
    const n = parseNumber(first(a.names));
    if (n != null && n >= 1 && n <= 30) scores[a.key] = n;
  }
  // Saves and skills a stat block lists are the ones that differ from the plain ability modifier.
  const saves = ABILITIES.flatMap(a => {
    const bonus = parseNumber(first(a.save));
    return bonus != null && scores[a.key] != null && bonus !== mod(scores[a.key]!) ? [`${a.label} ${signed(bonus)}`] : [];
  });
  const skills = SKILLS.flatMap(sk => {
    const bonus = parseNumber(first(sk.names));
    return bonus != null && scores[sk.ability] != null && bonus !== mod(scores[sk.ability]!) ? [`${sk.label} ${signed(bonus)}`] : [];
  });

  const conMod = scores.con != null ? mod(scores.con) : null;
  const hd = first(['hdtotal', 'total', 'hitdice', 'hd']);
  const hitDice = hd && /^\d+d\d+$/i.test(hd.replace(/\s/g, '')) && conMod && pc.level
    ? `${hd.replace(/\s/g, '')}${signed(conMod * pc.level)}`
    : hd;
  const extraSenses = first(['additionalsenses', 'senses']);
  const senses = [
    extraSenses ? extraSenses.charAt(0).toLowerCase() + extraSenses.slice(1).replace(/,\s*$/, '') : null,
    pc.passive_perception != null ? `passive Perception ${pc.passive_perception}` : null,
  ].filter(Boolean).join(', ');
  const size = first(['size']);
  const prof = parseNumber(first(['profbonus', 'proficiencybonus']));
  const attacks = attacksFrom(first);
  const content = [
    `${size ?? 'Medium'} humanoid${pc.race ? ` (${pc.race})` : ''}`,
    [who, prof != null ? `Proficiency bonus ${signed(prof)}` : null].filter(Boolean).map(x => `${x}.`).join(' ') || null,
    attacks.length ? `Actions\n${attacks.join('\n')}` : null,
  ].filter(Boolean).join('\n\n');

  const statblock: StatSheetValues = {
    name: pc.character_name ?? undefined,
    creature_type: 'humanoid',
    armor_class: pc.armor_class ?? undefined,
    hit_points: pc.max_hp ?? undefined,
    hit_dice: hitDice ?? undefined,
    speed: first(['speed'])?.replace(/\s*\(walking\)/i, '').trim() || undefined,
    ...scores,
    saving_throws: saves.join(', ') || undefined,
    skills: skills.join(', ') || undefined,
    senses: senses || undefined,
    languages: languagesFrom(first(['proficiencieslang', 'proficiencies', 'languages'])) ?? undefined,
    content,
  };
  return { npc, statblock };
}

/** Enough was read to make an NPC: a name and some numbers. */
export const npcReadEnough = (s: NpcSheet) =>
  !!s.npc.name && (s.statblock.armor_class != null || s.statblock.hit_points != null || s.statblock.str != null);

/** What the assistant returned for an NPC (from a character sheet or a stat block), cleaned. */
export function cleanNpcSheet(raw: unknown): NpcSheet {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { npc?: Record<string, unknown>; statblock?: Record<string, unknown> };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const npc: NpcSheetValues = {
    name: str(obj.npc?.name), role: str(obj.npc?.role),
    description: str(obj.npc?.description), hooks_motivations: str(obj.npc?.hooks_motivations),
  };
  const statblock: StatSheetValues = {};
  if (obj.statblock && typeof obj.statblock === 'object') {
    const fields = statblockFieldsFromForm(parsedToMonsterForm(obj.statblock));
    for (const { key } of STATBLOCK_SHEET_FIELDS) {
      const v = fields[key];
      if (v != null && v !== '') (statblock as Record<string, unknown>)[key] = v;
    }
    if (!statblock.name && npc.name) statblock.name = npc.name;
  }
  if (!npc.name && statblock.name) npc.name = statblock.name;
  return { npc, statblock };
}

/** The NPC a sheet is for, by name. */
export function matchNPC<T extends { id: string; name: string }>(sheet: NpcSheet, npcs: T[]): T | null {
  const name = sheet.npc.name;
  if (!name) return null;
  return npcs.find(n => n.name && sameName(n.name, name)) ?? null;
}

/** The changes to the NPC and to its stat sheet (the linked one, or a new one), grouped. */
export function npcSheetChanges(
  sheet: NpcSheet,
  npc?: Partial<NPC> | null,
  statblock?: Partial<StatSheetFields> | null,
): FieldChange[] {
  return [
    ...diffValues(sheet.npc, npc as Record<string, unknown> | null, NPC_SHEET_FIELDS, NPC_GROUP),
    ...diffValues(sheet.statblock, statblock as Record<string, unknown> | null, STATBLOCK_SHEET_FIELDS, STATBLOCK_GROUP),
  ];
}

/**
 * The whole stat sheet to save: what it has now (none for a new one) with the
 * ticked changes on top. Every column is written, so a save can't blank one.
 */
export function mergedStatblock(existing: Partial<StatSheetFields> | null | undefined, patch: StatSheetValues, fallbackName: string): StatSheetFields {
  const base = statblockFieldsFromForm(emptyMonsterForm());
  const kept = Object.fromEntries(
    (Object.keys(base) as (keyof StatSheetFields)[]).filter(k => existing && existing[k] !== undefined).map(k => [k, existing![k]]),
  );
  const merged = { ...base, ...kept, ...patch } as StatSheetFields;
  return { ...merged, name: merged.name || fallbackName };
}
