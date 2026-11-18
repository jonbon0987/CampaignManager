// Reading a player character off a D&D character sheet PDF.
//
// Fillable sheets (D&D Beyond's "Export to PDF", the official 5e sheet and its
// many look-alikes) carry their values in named form fields, so those are read
// exactly: fromFormFields maps whatever names a sheet uses onto the PC's own
// fields. Anything else (a flattened or printed sheet) goes to the AI, which
// returns the same SheetValues (see api/parse-character-sheet).

import type { PlayerCharacter } from './database.types';

/** The parts of a PC a sheet can fill. */
export type SheetValues = Partial<Pick<PlayerCharacter,
  | 'character_name' | 'player_name' | 'race' | 'class' | 'level' | 'xp' | 'background'
  | 'max_hp' | 'armor_class' | 'passive_perception' | 'passive_insight' | 'passive_investigation'
  | 'spell_save_dc' | 'story_hooks'>>;
export type SheetField = keyof SheetValues;

/** The fields in the order the review shows them, with their labels. */
export const SHEET_FIELDS: { key: SheetField; label: string }[] = [
  { key: 'character_name', label: 'Name' },
  { key: 'player_name', label: 'Player' },
  { key: 'race', label: 'Race / species' },
  { key: 'class', label: 'Class' },
  { key: 'level', label: 'Level' },
  { key: 'xp', label: 'XP' },
  { key: 'background', label: 'Background' },
  { key: 'max_hp', label: 'Max HP' },
  { key: 'armor_class', label: 'AC' },
  { key: 'passive_perception', label: 'Passive Perception' },
  { key: 'passive_insight', label: 'Passive Insight' },
  { key: 'passive_investigation', label: 'Passive Investigation' },
  { key: 'spell_save_dc', label: 'Spell save DC' },
  { key: 'story_hooks', label: 'Story hooks' },
];

const NUMERIC = new Set<SheetField>(['level', 'xp', 'max_hp', 'armor_class', 'passive_perception', 'passive_insight', 'passive_investigation', 'spell_save_dc']);

/** A form field name reduced to letters and digits, lower case: "Race " and "RACE" both read "race". */
export const normalizeFieldName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// The names each value goes by on the sheets we know, normalized. D&D Beyond's
// export uses CharacterName, "CLASS  LEVEL", "PLAYER NAME", RACE, BACKGROUND,
// "EXPERIENCE POINTS", AC, MaxHP, Passive1-3 (Perception, Insight,
// Investigation) and spellSaveDC0; the official sheet CharacterName,
// ClassLevel, PlayerName, "Race ", XP, AC, HPMax, Passive and "SpellSaveDC  2".
// The first
// one with a value wins. Kept short and specific: a loose match (anything with
// "hp" in it) would read the wrong box on some sheet.
const ALIASES: Record<Exclude<SheetField, 'class' | 'level' | 'story_hooks'>, string[]> = {
  character_name: ['charactername', 'name', 'charactername2'],
  player_name: ['playername', 'player'],
  race: ['race', 'species', 'racespecies', 'speciesrace'],
  xp: ['xp', 'experiencepoints', 'experience', 'exp'],
  background: ['background'],
  max_hp: ['hpmax', 'maxhp', 'hitpointmaximum', 'hitpointsmax', 'maxhitpoints'],
  armor_class: ['ac', 'armorclass', 'armourclass'],
  passive_perception: ['passiveperception', 'passive', 'passivewisdomperception', 'passive1'],
  passive_insight: ['passiveinsight', 'passivewisdominsight', 'passive2'],
  passive_investigation: ['passiveinvestigation', 'passiveintelligenceinvestigation', 'passive3'],
  spell_save_dc: ['spellsavedc', 'spellsavedc0', 'spellsavedc2', 'spellsave'],
};
const CLASS_LEVEL = ['classlevel', 'classandlevel', 'classlevels'];
const CLASS_ONLY = ['class', 'classes'];
const LEVEL_ONLY = ['level', 'characterlevel', 'totallevel'];
const STORY = [
  { label: 'Personality', names: ['personalitytraits', 'personality'] },
  { label: 'Ideals', names: ['ideals'] },
  { label: 'Bonds', names: ['bonds'] },
  { label: 'Flaws', names: ['flaws'] },
];

/** The first whole number in a value: "+2" → 2, "24 / 24" → 24, "1,250" → 1250. */
export function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /-?\d[\d,]*/.exec(raw);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * "Fighter 3", "Fighter 3 / Rogue 2" or "Wizard (School of Evocation) 5" →
 * the class text and the total level. A single class drops its number (the
 * level carries it); several keep theirs so the split isn't lost.
 */
export function parseClassLevel(raw: string): { class: string | null; level: number | null } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { class: null, level: null };
  const parsed = text.split(/\s*[/,;|]\s*/).filter(Boolean).map(part => {
    // "Fighter 3", "Fighter 3 (Battle Master)", "Wizard (Evocation) 5", "3 Fighter"
    const after = /^(.*?)\s*(\d{1,2})\s*(\(.*\))?$/.exec(part);
    if (after && after[1]) return { name: [after[1], after[3]].filter(Boolean).join(' '), level: parseInt(after[2], 10) };
    const before = /^(\d{1,2})\s+(.+)$/.exec(part);
    if (before) return { name: before[2], level: parseInt(before[1], 10) };
    return { name: part, level: null as number | null };
  });
  const levels = parsed.map(p => p.level).filter((n): n is number => n != null);
  const total = levels.length ? levels.reduce((a, b) => a + b, 0) : null;
  const cls = parsed.length > 1
    ? parsed.map(p => (p.level != null ? `${p.name} ${p.level}` : p.name)).join(' / ')
    : parsed[0].name || null;
  return { class: cls, level: total };
}

/** A sheet's form fields (name → value) as PC values. Unknown fields are ignored. */
export function fromFormFields(fields: Record<string, string>): SheetValues {
  const byName = new Map<string, string>();
  for (const [name, value] of Object.entries(fields)) {
    const v = (value ?? '').toString().trim();
    const key = normalizeFieldName(name);
    if (v && !byName.has(key)) byName.set(key, v);
  }
  const first = (names: string[]) => names.map(n => byName.get(n)).find(v => !!v) ?? null;
  const out: SheetValues = {};

  for (const [field, names] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
    const raw = first(names);
    if (raw == null) continue;
    if (NUMERIC.has(field)) {
      const n = parseNumber(raw);
      if (n != null) (out as Record<string, unknown>)[field] = n;
    } else {
      (out as Record<string, unknown>)[field] = raw;
    }
  }

  const classLevel = first(CLASS_LEVEL);
  if (classLevel) {
    const { class: cls, level } = parseClassLevel(classLevel);
    if (cls) out.class = cls;
    if (level != null) out.level = level;
  } else {
    const cls = first(CLASS_ONLY);
    if (cls) out.class = cls;
  }
  if (out.level == null) {
    const level = parseNumber(first(LEVEL_ONLY));
    if (level != null) out.level = level;
  }

  const story = STORY
    .map(s => ({ label: s.label, text: first(s.names) }))
    .filter((s): s is { label: string; text: string } => !!s.text)
    .map(s => `**${s.label}.** ${s.text}`);
  if (story.length) out.story_hooks = story.join('\n\n');

  return out;
}

/** True when a sheet's form fields gave enough to call it read (a name and something else). */
export const readEnough = (v: SheetValues) => Object.keys(v).length >= 2;

/** Values the AI returned, cleaned: known fields only, numbers as numbers, blanks dropped. */
export function cleanSheetValues(raw: unknown): SheetValues {
  if (!raw || typeof raw !== 'object') return {};
  const out: SheetValues = {};
  for (const { key } of SHEET_FIELDS) {
    const v = (raw as Record<string, unknown>)[key];
    if (v == null || v === '') continue;
    if (NUMERIC.has(key)) {
      const n = typeof v === 'number' ? Math.round(v) : parseNumber(String(v));
      if (n != null) (out as Record<string, unknown>)[key] = n;
    } else if (typeof v === 'string' && v.trim()) {
      (out as Record<string, unknown>)[key] = v.trim();
    }
  }
  return out;
}

const sameName = (a: string, b: string) => normalizeFieldName(a) === normalizeFieldName(b);

/** The existing PC a sheet is for, by character name. */
export function matchPC<T extends Pick<PlayerCharacter, 'id' | 'character_name'>>(values: SheetValues, pcs: T[]): T | null {
  const name = values.character_name;
  if (!name) return null;
  return pcs.find(p => p.character_name && sameName(p.character_name, name)) ?? null;
}

export interface FieldChange {
  key: SheetField;
  label: string;
  current: string | number | null;
  next: string | number;
  /** Ticked to begin with: the PC had nothing there, or the sheet differs. */
  apply: boolean;
}

/** What importing `values` would change on `pc` (or on a new PC, with no `pc`). Unchanged fields are left out. */
export function sheetChanges(values: SheetValues, pc?: Partial<Pick<PlayerCharacter, SheetField>> | null): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const { key, label } of SHEET_FIELDS) {
    const next = values[key];
    if (next == null || next === '') continue;
    const current = (pc?.[key] ?? null) as string | number | null;
    if (current != null && String(current).trim() === String(next).trim()) continue;
    changes.push({ key, label, current: current === '' ? null : current, next: next as string | number, apply: true });
  }
  return changes;
}

/** The patch the ticked changes make. */
export const patchFrom = (changes: FieldChange[]): SheetValues =>
  Object.fromEntries(changes.filter(c => c.apply).map(c => [c.key, c.next])) as SheetValues;
