// src/lib/randomTableGeneration.ts
// -----------------------------------------------------------
// Prompt-building + response-parsing for AI-assisted random tables. Two shapes:
//   • a whole weighted table (name + subtitle + entries), and
//   • a single entry to append to an existing table.
// Kept pure (no React/fetch) so the parsers are unit-tested; the UI calls the
// generic /api/generate-encounter JSON proxy with these prompts and feeds the
// text back through the parsers here.
// -----------------------------------------------------------

import { RARITY_WEIGHTS, kindMeta } from './randomEncounter';
import type { RandomEncounterEntry } from './database.types';

let seq = 0;
function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `gen-${Date.now()}-${seq++}`;
}

// Per-kind description of the extra JSON fields each entry should carry.
function entryFieldSpec(kind: string): string {
  switch (kind) {
    case 'encounter':
      return `Also include:
    "type": "combat" | "social" | "either",
    "creatures": [array of creature names to field; use EXACT names from the bestiary list when one fits, otherwise invent a short name]`;
    case 'treasure':
      return `Also include:
    "coins": "e.g. 4d6 × 100 gp",
    "valuables": "a gem/art object or short list (may be empty)",
    "magicItem": "a magic item or 'DM's choice' (may be empty)"`;
    case 'magic':
      return `Also include:
    "itemType": "e.g. Wondrous item, Weapon (longsword), Potion",
    "attunement": true | false,
    "itemText": "1-3 sentences of the item's rules/flavor"`;
    case 'wild':
      return `Also include:
    "effect": "the mechanical surge effect, 1-2 sentences"`;
    case 'custom':
      return `Also include:
    "card": "fortune" | "doom" | "none"  (use "none" for a plain read-aloud entry)`;
    default:
      return '';
  }
}

const RARITY_NOTE = `"rarity" sets how likely the entry is: "common" (most likely), "uncommon", "rare", "veryrare" (rarest). Give commonplace results a common rarity and dramatic/powerful ones a rarer one.`;

function bestiaryClause(names: string[]): string {
  if (names.length === 0) return '';
  return `\n\nBestiary (reference creatures by these EXACT names when they fit):\n${names.map(n => `- ${n}`).join('\n')}`;
}

export interface GenerateTableOpts {
  kind: string;
  region?: string;
  theme?: string;
  count: number;
  die?: number;
  contextBlock?: string;
  additional?: string;
  bestiaryNames?: string[];
}

/** Prompt for a whole weighted table of `count` entries. */
export function buildTablePrompt(opts: GenerateTableOpts): string {
  const label = kindMeta(opts.kind).label;
  const die = opts.die ?? 100;
  const region = opts.region?.trim() ? ` for the region "${opts.region.trim()}"` : '';
  const theme = opts.theme?.trim() ? `\n\nTheme / concept: ${opts.theme.trim()}.` : '';
  const additional = opts.additional?.trim() ? `\n\nAdditional DM instructions: ${opts.additional.trim()}` : '';
  const bestiary = opts.kind === 'encounter' ? bestiaryClause(opts.bestiaryNames ?? []) : '';

  return `You are building a D&D 5e ${label} random table${region}. Produce ${opts.count} varied, evocative entries suited to a weighted d${die} roll.${theme}${opts.contextBlock ?? ''}${bestiary}${additional}

${RARITY_NOTE}

Respond with a single JSON object (no markdown, no commentary — just raw JSON):
{
  "name": "a short, evocative table name",
  "subtitle": "one line of flavor — where and when this table applies",
  "entries": [
    {
      "name": "result name",
      "description": "1-2 sentences the DM reads or paraphrases",
      "rarity": "common" | "uncommon" | "rare" | "veryrare",
      ${entryFieldSpec(opts.kind).replace(/\n/g, '\n      ')}
    }
  ]
}
Return exactly ${opts.count} entries.`;
}

export interface GenerateEntryOpts {
  kind: string;
  tableName?: string;
  region?: string;
  existingNames?: string[];
  bestiaryNames?: string[];
}

/** Prompt for a single entry to append to an existing table. */
export function buildEntryPrompt(opts: GenerateEntryOpts): string {
  const label = kindMeta(opts.kind).label;
  const region = opts.region?.trim() ? ` for the region "${opts.region.trim()}"` : '';
  const table = opts.tableName?.trim() ? ` on the table "${opts.tableName.trim()}"` : '';
  const avoid = (opts.existingNames ?? []).length > 0
    ? `\n\nDo NOT duplicate these existing entries: ${(opts.existingNames ?? []).join('; ')}.`
    : '';
  const bestiary = opts.kind === 'encounter' ? bestiaryClause(opts.bestiaryNames ?? []) : '';

  return `Write ONE new D&D 5e ${label} entry${table}${region}. Make it distinct and evocative.${avoid}${bestiary}

${RARITY_NOTE}

Respond with a single JSON object (no markdown, just raw JSON):
{
  "name": "result name",
  "description": "1-2 sentences the DM reads or paraphrases",
  "rarity": "common" | "uncommon" | "rare" | "veryrare",
  ${entryFieldSpec(opts.kind).replace(/\n/g, '\n  ')}
}`;
}

// ── Parsing ────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** Convert one raw AI entry object into a typed weighted entry for `kind`. */
export function rawToEntry(
  kind: string,
  raw: Record<string, unknown>,
  bestiaryByName?: Map<string, string>,
): RandomEncounterEntry {
  const rarity = ['common', 'uncommon', 'rare', 'veryrare'].includes(String(raw.rarity))
    ? String(raw.rarity) : 'common';
  const entry: RandomEncounterEntry = {
    id: uid(),
    name: str(raw.name) ?? '',
    description: str(raw.description) ?? '',
    weight: RARITY_WEIGHTS[rarity] ?? 8,
    rarity,
  };

  if (kind === 'encounter') {
    const t = raw.type;
    entry.entryKind = t === 'social' || t === 'either' ? t : 'combat';
    const names = Array.isArray(raw.creatures) ? raw.creatures : [];
    const linked: { id: string; note: string | null }[] = [];
    for (const n of names) {
      const id = bestiaryByName?.get(String(n).toLowerCase().trim());
      if (id && !linked.some(c => c.id === id)) linked.push({ id, note: null });
    }
    entry.creatures = linked;
  } else if (kind === 'treasure') {
    if (str(raw.coins)) entry.coins = str(raw.coins);
    if (str(raw.valuables)) entry.valuables = str(raw.valuables);
    if (str(raw.magicItem)) entry.magicItem = str(raw.magicItem);
  } else if (kind === 'magic') {
    if (str(raw.itemType)) entry.itemType = str(raw.itemType);
    if (typeof raw.attunement === 'boolean') entry.attunement = raw.attunement;
    if (str(raw.itemText)) entry.itemText = str(raw.itemText);
  } else if (kind === 'wild') {
    if (str(raw.effect)) entry.effect = str(raw.effect);
  } else if (kind === 'custom') {
    if (raw.card === 'fortune' || raw.card === 'doom') entry.cardKind = raw.card;
  }

  return entry;
}

export interface ParsedTable {
  name?: string;
  subtitle?: string;
  entries: RandomEncounterEntry[];
}

/** Parse a whole-table AI response. Throws if no usable entries were returned. */
export function parseGeneratedTable(
  kind: string,
  text: string,
  bestiaryByName?: Map<string, string>,
): ParsedTable {
  const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries = rawEntries
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map(e => rawToEntry(kind, e, bestiaryByName))
    .filter(e => e.name || e.description);
  if (entries.length === 0) throw new Error('The generator returned no usable entries.');
  return { name: str(parsed.name), subtitle: str(parsed.subtitle), entries };
}

/** Parse a single-entry AI response. */
export function parseGeneratedEntry(
  kind: string,
  text: string,
  bestiaryByName?: Map<string, string>,
): RandomEncounterEntry {
  const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  const entry = rawToEntry(kind, parsed, bestiaryByName);
  if (!entry.name && !entry.description) throw new Error('The generator returned an empty entry.');
  return entry;
}
