// src/lib/statblockCompletion.ts
// -----------------------------------------------------------
// Helpers for the "fill in missing details" action on a creature stat sheet:
// building the completion prompt from a partial form, parsing the AI's JSON
// back into a form, and merging so only blank fields get filled (the DM's own
// values are always preserved). Also shared by the from-scratch generator.
// Pure — no React/fetch — so the mapping/merge is unit-tested.
// -----------------------------------------------------------

import type { MonsterForm } from '../components/tabs/CreatureStatblocks';

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
