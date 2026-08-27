// src/lib/moduleStructure.ts
// -----------------------------------------------------------
// Prompt-building + response-parsing for expanding a module into its
// submodule/scene tree. A module's synopsis (plus anything else the DM types)
// goes in; a runnable outline of submodules, each with its own scenes, comes
// back.
//
// Two callers share this:
//   • the "Build out module" generator on the module overview, which writes the
//     parsed tree straight into the module the DM is looking at, and
//   • the chat assistant, which reuses the type vocabularies and the same
//     shape rules when it proposes submodules/scenes into the staging tray.
//
// Pure — no React/fetch — so the prompt and the parser are unit-tested.
// -----------------------------------------------------------

import { limitFor } from './fieldLimits';
import type { SelectedEntity } from './campaignContext';

/** Submodule kinds the outline rail colours and the type picker offers. */
export const SUBMODULE_TYPES = [
  'location', 'encounter', 'social', 'heist', 'event', 'travel', 'exploration', 'other',
];

/** Scene kinds — the beats inside a submodule. */
export const SCENE_TYPES = [
  'encounter', 'puzzle', 'social', 'trap', 'exploration', 'event', 'other',
];

// How many submodules / scenes-per-submodule the generator will author. The
// ceilings keep one response inside the JSON proxy's token budget; a tree
// bigger than this is better built in two passes.
export const MIN_SUBMODULES = 1;
export const MAX_SUBMODULES = 10;
export const MIN_SCENES = 0;
export const MAX_SCENES = 6;

// ── Draft shapes ───────────────────────────────────────────────────────────

export interface DraftScene {
  title: string;
  scene_type: string | null;
  summary: string | null;
  content: string | null;
  dm_notes: string | null;
}

export interface DraftSubmodule {
  title: string;
  submodule_type: string | null;
  summary: string | null;
  content: string | null;
  dm_notes: string | null;
  scenes: DraftScene[];
}

// ── Prompt ─────────────────────────────────────────────────────────────────

export interface ModuleSource {
  title: string;
  chapter?: string | null;
  synopsis?: string | null;
  rewards?: string | null;
  dm_notes?: string | null;
  /** Titles of submodules the module already has, so the AI doesn't repeat them. */
  existingTitles?: string[];
}

export interface GenerateStructureOpts {
  module: ModuleSource;
  /** How many submodules to author. */
  submoduleCount: number;
  /** How many scenes to put under each submodule. */
  scenesPer: number;
  /** Extra description the DM typed — used instead of, or alongside, the synopsis. */
  description?: string;
  /** Hand-picked campaign/world entities, already formatted by buildSelectedContextBlock. */
  contextBlock?: string;
  additional?: string;
}

const STRUCTURE_JSON_SPEC = `{
  "submodules": [
    {
      "title": "a short, evocative section name",
      "type": "one of: ${SUBMODULE_TYPES.join('|')}",
      "summary": "one line the DM reads in the outline rail — what this section IS",
      "content": "the full write-up: where it happens, who is there, what the party can do, how it can go, and how it hands off to the next section. Several paragraphs of markdown.",
      "dm_notes": "secrets, contingencies, and what to do if the party skips or breaks this",
      "scenes": [
        {
          "title": "the beat's name",
          "type": "one of: ${SCENE_TYPES.join('|')}",
          "summary": "one line — the beat in a sentence",
          "content": "how to run it: read-aloud or sensory hook, what the party faces, the checks or tactics involved, and the outcomes that matter",
          "dm_notes": "hidden info, alternate outcomes, or a fallback if it stalls"
        }
      ]
    }
  ]
}`;

function sourceBlock(m: ModuleSource): string {
  const lines: string[] = [`Module: ${m.title?.trim() || 'Untitled Module'}`];
  if (m.chapter?.trim()) lines.push(`Chapter: ${m.chapter.trim()}`);
  if (m.synopsis?.trim()) lines.push(`Synopsis: ${m.synopsis.trim()}`);
  if (m.rewards?.trim()) lines.push(`Rewards: ${m.rewards.trim()}`);
  if (m.dm_notes?.trim()) lines.push(`DM notes: ${m.dm_notes.trim()}`);
  return lines.join('\n');
}

/**
 * Prompt for expanding a module into `submoduleCount` submodules, each holding
 * `scenesPer` scenes. The module's own fields are the primary source material;
 * `description` is whatever else the DM typed and outranks the synopsis when
 * the two pull in different directions.
 */
export function buildModuleStructurePrompt(opts: GenerateStructureOpts): string {
  const { module: m, submoduleCount, scenesPer } = opts;

  const description = opts.description?.trim()
    ? `\n\nThe DM also describes it this way (this outranks the synopsis where they differ):\n${opts.description.trim()}`
    : '';

  const existing = (m.existingTitles ?? []).filter(t => t.trim());
  const avoid = existing.length > 0
    ? `\n\nThis module ALREADY has these submodules — do NOT repeat or restate them. What you write continues from where they leave off:\n${existing.map(t => `- ${t}`).join('\n')}`
    : '';

  const sceneClause = scenesPer > 0
    ? `Give each submodule exactly ${scenesPer} scene${scenesPer === 1 ? '' : 's'} — the individual beats the DM runs at the table, in the order they are most likely to come up.`
    : 'Do NOT author scenes — return an empty "scenes" array for every submodule.';

  const additional = opts.additional?.trim()
    ? `\n\nAdditional DM instructions: ${opts.additional.trim()}`
    : '';

  return `You are breaking a D&D 5e adventure module into the sections a DM actually runs. Read the module below and author ${submoduleCount} submodule${submoduleCount === 1 ? '' : 's'} — the distinct chunks of play it divides into (a location to explore, a heist, a social negotiation, a journey, a set-piece event).

${sourceBlock(m)}${description}${avoid}${opts.contextBlock ?? ''}

${sceneClause}

Rules:
- The submodules must cover the whole arc of the module, in play order: how the party gets pulled in, the middle where it can go several ways, and how it resolves.
- Each submodule is a section of play, not a summary of the module. Write it so the DM could run it from the page cold.
- Vary the types. A module that is eight combats in a row is a bad module — mix exploration, social, and set-piece beats against the fights.
- Prefer the NPCs, factions, locations, and threads named in the module and in any context above over inventing new ones. Invent only what the module is missing.
- Leave outcomes open where the party's choices matter. Do not script what the players do.
- Write in the module's own tone.${additional}

Respond with a single JSON object using this exact structure (no markdown, no commentary — just raw JSON):
${STRUCTURE_JSON_SPEC}
Return exactly ${submoduleCount} submodule${submoduleCount === 1 ? '' : 's'}.`;
}

/** Convenience: the context block for a module generator, given picked entities. */
export type { SelectedEntity };

// ── Parsing ────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/**
 * Trim a generated value to the column's cap. The AI overruns a limit now and
 * then; without this the write layer rejects the whole tree over one long
 * write-up, which is a worse outcome for the DM than a trimmed paragraph.
 */
export function clampField(table: string, column: string, value: string | null): string | null {
  if (value == null) return null;
  const max = limitFor(table, column);
  return max != null && value.length > max ? value.slice(0, max) : value;
}

/** Pick the closest valid type, falling back to the list's designated default. */
function normalizeType(raw: unknown, allowed: string[], fallback: string): string {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return allowed.includes(v) ? v : fallback;
}

function rawToScene(raw: Record<string, unknown>): DraftScene {
  return {
    title: clampField('scenes', 'title', str(raw.title) ?? 'Untitled scene') ?? 'Untitled scene',
    scene_type: normalizeType(raw.type ?? raw.scene_type, SCENE_TYPES, 'encounter'),
    summary: clampField('scenes', 'summary', str(raw.summary)),
    content: clampField('scenes', 'content', str(raw.content)),
    dm_notes: clampField('scenes', 'dm_notes', str(raw.dm_notes)),
  };
}

function rawToSubmodule(raw: Record<string, unknown>): DraftSubmodule {
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  return {
    title: clampField('submodules', 'title', str(raw.title) ?? 'Untitled submodule') ?? 'Untitled submodule',
    submodule_type: normalizeType(raw.type ?? raw.submodule_type, SUBMODULE_TYPES, 'location'),
    summary: clampField('submodules', 'summary', str(raw.summary)),
    content: clampField('submodules', 'content', str(raw.content)),
    dm_notes: clampField('submodules', 'dm_notes', str(raw.dm_notes)),
    scenes: rawScenes
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map(rawToScene)
      .filter(s => s.title || s.summary || s.content),
  };
}

/**
 * Parse a generated module tree. Throws if nothing usable came back, so the
 * caller can show the DM a real failure instead of silently adding nothing.
 */
export function parseModuleStructure(text: string): DraftSubmodule[] {
  const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  // Tolerate a bare array — models drop the wrapper object often enough.
  const rawSubs = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.submodules) ? parsed.submodules : [];
  const subs = rawSubs
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(rawToSubmodule)
    .filter(s => s.title || s.summary || s.content);
  if (subs.length === 0) throw new Error('The generator returned no usable submodules.');
  return subs;
}

/** Total scenes across a draft tree — used for the review header and toasts. */
export function countScenes(subs: DraftSubmodule[]): number {
  return subs.reduce((n, s) => n + s.scenes.length, 0);
}
