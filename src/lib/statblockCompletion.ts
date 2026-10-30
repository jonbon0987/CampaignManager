// src/lib/statblockCompletion.ts
// -----------------------------------------------------------
// Helpers for the "fill in missing details" action on a creature stat sheet:
// building the completion prompt from a partial form, parsing the AI's JSON
// back into a form, and merging so only blank fields get filled (the DM's own
// values are always preserved). Also shared by the from-scratch generator.
// Pure — no React/fetch — so the mapping/merge is unit-tested.
// -----------------------------------------------------------

import type { MonsterForm } from '../components/tabs/CreatureStatblocks';
import type { MonsterStatblock } from './database.types';

const s = (v: unknown): string => (v == null ? '' : String(v));

/** Map a raw AI stat-block JSON object into a complete MonsterForm. */
export function parsedToMonsterForm(parsed: Record<string, unknown>): MonsterForm {
  return {
    name: s(parsed.name),
    creature_type: parsed.creature_type ? s(parsed.creature_type) : 'monstrosity',
    challenge_rating: s(parsed.challenge_rating),
    armor_class: parsed.armor_class != null ? s(parsed.armor_class) : '',
    ac_descriptor: s(parsed.ac_descriptor),
    hit_points: parsed.hit_points != null ? s(parsed.hit_points) : '',
    hit_dice: s(parsed.hit_dice),
    speed: s(parsed.speed),
    str: parsed.str != null ? s(parsed.str) : '',
    dex: parsed.dex != null ? s(parsed.dex) : '',
    con: parsed.con != null ? s(parsed.con) : '',
    int: parsed.int != null ? s(parsed.int) : '',
    wis: parsed.wis != null ? s(parsed.wis) : '',
    cha: parsed.cha != null ? s(parsed.cha) : '',
    saving_throws: s(parsed.saving_throws),
    skills: s(parsed.skills),
    damage_immunities: s(parsed.damage_immunities),
    damage_resistances: s(parsed.damage_resistances),
    condition_immunities: s(parsed.condition_immunities),
    senses: s(parsed.senses),
    languages: s(parsed.languages),
    content: s(parsed.content),
    dm_notes: s(parsed.dm_notes),
    tags: s(parsed.tags),
  };
}

/**
 * Merge `generated` into `current`, keeping every field the DM has already
 * filled and only taking generated values for blank fields. `creature_type`
 * always keeps the current value (it has a sensible default).
 */
export function mergeMissing(current: MonsterForm, generated: MonsterForm): MonsterForm {
  const out = { ...current };
  (Object.keys(current) as (keyof MonsterForm)[]).forEach(key => {
    if (key === 'creature_type') return;
    if (!current[key].trim() && generated[key].trim()) out[key] = generated[key];
  });
  return out;
}

const STATBLOCK_JSON_SPEC = `{
  "name": "...",
  "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
  "challenge_rating": "(CR as a string, e.g. \\"1/4\\" or \\"5\\")",
  "armor_class": (integer),
  "ac_descriptor": "(optional, e.g. \\"natural armor\\" — omit if none)",
  "hit_points": (integer),
  "hit_dice": "(e.g. \\"6d10+12\\")",
  "speed": "(e.g. \\"30 ft., fly 60 ft.\\")",
  "str": (integer 1-30), "dex": (integer 1-30), "con": (integer 1-30),
  "int": (integer 1-30), "wis": (integer 1-30), "cha": (integer 1-30),
  "saving_throws": "(e.g. \\"Dex +4, Con +6\\" — omit if none)",
  "skills": "(e.g. \\"Perception +5, Stealth +4\\" — omit if none)",
  "damage_resistances": "(omit if none)",
  "damage_immunities": "(omit if none)",
  "condition_immunities": "(omit if none)",
  "senses": "(e.g. \\"darkvision 60 ft., passive Perception 15\\")",
  "languages": "(e.g. \\"Common, Draconic\\" — omit if none)",
  "content": "Full actions, bonus actions, reactions, legendary actions, and special traits as plain text. Do NOT repeat AC/HP/speed/ability scores here.",
  "tags": "comma-separated flavor tags",
  "dm_notes": "2-3 sentences of DM tactics"
}`;

// Human labels for the fields we surface as "already provided" in the prompt.
const FIELD_LABELS: Partial<Record<keyof MonsterForm, string>> = {
  name: 'Name',
  creature_type: 'Creature type',
  challenge_rating: 'Challenge rating',
  armor_class: 'Armor class',
  ac_descriptor: 'AC descriptor',
  hit_points: 'Hit points',
  hit_dice: 'Hit dice',
  speed: 'Speed',
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
  saving_throws: 'Saving throws',
  skills: 'Skills',
  damage_resistances: 'Damage resistances',
  damage_immunities: 'Damage immunities',
  condition_immunities: 'Condition immunities',
  senses: 'Senses',
  languages: 'Languages',
  content: 'Actions & traits',
  dm_notes: 'DM notes',
  tags: 'Tags',
};

/**
 * Prompt to complete a partial stat block. Lists the fields the DM already
 * filled (which must be preserved) and asks the AI to fill everything else,
 * keeping it consistent with the creature's CR and type.
 */
export function buildCompletionPrompt(
  form: MonsterForm,
  opts: { contextBlock?: string; additional?: string } = {},
): string {
  const provided = (Object.keys(FIELD_LABELS) as (keyof MonsterForm)[])
    .filter(k => form[k].trim() !== '')
    .map(k => `- ${FIELD_LABELS[k]}: ${form[k].trim()}`)
    .join('\n');

  const providedBlock = provided
    ? `\n\nAlready provided (KEEP these EXACTLY — do not change them):\n${provided}`
    : '';
  const hasContent = form.content.trim() !== '';
  const contentClause = hasContent
    ? ''
    : `\n\nIMPORTANT: the "content" field is REQUIRED and is currently empty — you MUST author it in full. Write the creature's special traits and Actions (attacks with to-hit, reach/range, and damage), plus bonus actions, reactions, and legendary actions where the challenge rating warrants. Never return an empty "content".`;
  const additional = opts.additional?.trim() ? `\n\nAdditional DM instructions: ${opts.additional.trim()}` : '';

  return `Complete this partial D&D 5e creature stat block into a full, ready-to-run stat block. Keep every value already provided EXACTLY as given, and author everything that is missing (ability scores, AC, HP, speed, saves, skills, senses, languages, damage types, AND a full actions/traits block) so the result is complete and internally consistent with the creature's challenge rating and type. If no challenge rating is given, choose one that fits.${providedBlock}${contentClause}${opts.contextBlock ?? ''}${additional}

Respond with a single JSON object using this exact structure (no markdown, no commentary — just raw JSON). Include the provided fields unchanged plus every field you filled in:
${STATBLOCK_JSON_SPEC}`;
}

/** A saved stat sheet as the editor's form (numbers as text, blanks as ''). */
export function formFromStatblock(m: MonsterStatblock): MonsterForm {
  const n = (v: number | null) => (v != null ? String(v) : '');
  return {
    name: m.name, creature_type: m.creature_type ?? 'monstrosity', challenge_rating: m.challenge_rating ?? '',
    armor_class: n(m.armor_class), ac_descriptor: m.ac_descriptor ?? '', hit_points: n(m.hit_points), hit_dice: m.hit_dice ?? '',
    speed: m.speed ?? '', str: n(m.str), dex: n(m.dex), con: n(m.con), int: n(m.int), wis: n(m.wis), cha: n(m.cha),
    saving_throws: m.saving_throws ?? '', skills: m.skills ?? '', damage_immunities: m.damage_immunities ?? '',
    damage_resistances: m.damage_resistances ?? '', condition_immunities: m.condition_immunities ?? '',
    senses: m.senses ?? '', languages: m.languages ?? '', content: m.content ?? '', dm_notes: m.dm_notes ?? '', tags: m.tags ?? '',
  };
}

/** The columns a stat sheet's form writes. */
export type StatSheetFields = Omit<MonsterStatblock, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'campaign_id' | 'world_id' | 'sort_order'>;

/** The editor's form as the columns to save (numbers parsed, blanks as null). */
export function statblockFieldsFromForm(f: MonsterForm): StatSheetFields {
  const int = (v: string) => { const x = parseInt(v.trim(), 10); return Number.isNaN(x) ? null : x; };
  const text = (v: string) => v || null;
  return {
    name: f.name, creature_type: text(f.creature_type), challenge_rating: text(f.challenge_rating),
    armor_class: int(f.armor_class), ac_descriptor: text(f.ac_descriptor), hit_points: int(f.hit_points), hit_dice: text(f.hit_dice),
    speed: text(f.speed), str: int(f.str), dex: int(f.dex), con: int(f.con), int: int(f.int), wis: int(f.wis), cha: int(f.cha),
    saving_throws: text(f.saving_throws), skills: text(f.skills), damage_immunities: text(f.damage_immunities),
    damage_resistances: text(f.damage_resistances), condition_immunities: text(f.condition_immunities),
    senses: text(f.senses), languages: text(f.languages), content: text(f.content), dm_notes: text(f.dm_notes), tags: text(f.tags),
  };
}
