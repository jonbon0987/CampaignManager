// generateWorld.ts
// ---------------------------------------------------------------------------
// The First-World Gate's "Generate with the Assistant" path. Calls the same
// /api/chat streaming endpoint the Workbench uses, with a system prompt that
// pins the model to a single JSON object describing a world draft. The reply
// is accumulated, the first balanced JSON object is extracted, and shaped into
// a WorldSeed plus a human-readable seed summary for the result card.
// ---------------------------------------------------------------------------

import { authHeaders } from './apiClient';
import { getAIProvider } from './aiProvider';
import type { WorldSeed } from './worldSeeds';

export interface WorldDraft {
  name: string;
  tagline: string;
  seed: WorldSeed;
  /** Short "N locations — …" style lines for the result card. */
  summaryLines: { glyph: string; text: string }[];
}

const SYSTEM = `You are a worldbuilding assistant for a tabletop RPG campaign manager.
Given a one- or two-sentence idea, draft the bones of a fictional setting.
Respond with a SINGLE JSON object and NOTHING else — no prose, no code fences.

Shape:
{
  "name": string,              // evocative proper name, 1-4 words
  "tagline": string,           // one vivid sentence, no trailing period required
  "factions": [ { "name": string, "faction_type": string, "overview": string } ],   // 2-3
  "locations": [ { "name": string, "location_type": string, "description": string } ], // 4-6
  "npcs": [ { "name": string, "role": string, "description": string } ],             // 3-4
  "lore": [ { "title": string, "category": string, "content": string } ]             // 2-3
}

Keep every string concise (descriptions under ~240 characters). location_type is
one of: continent, region, city, town, dungeon, landmark. Return only the JSON.`;

/** Extract the first balanced {...} object from a possibly-noisy string. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

async function streamChatText(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      provider: getAIProvider(),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let buffer = '';

  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    let event: { type: string; text?: string; message?: string };
    try { event = JSON.parse(line.slice(6)); } catch { return; }
    if (event.type === 'text' && event.text) text += event.text;
    else if (event.type === 'error') throw new Error(event.message ?? 'The assistant could not draft a world.');
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) processLine(line);
  }
  if (buffer.trim()) for (const line of buffer.split('\n')) processLine(line);

  return text;
}

interface RawDraft {
  name?: unknown;
  tagline?: unknown;
  factions?: unknown;
  locations?: unknown;
  npcs?: unknown;
  lore?: unknown;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function generateWorldDraft(prompt: string, signal?: AbortSignal): Promise<WorldDraft> {
  const text = await streamChatText(prompt, signal);
  const json = extractJsonObject(text);
  if (!json) throw new Error('The assistant returned an unexpected response. Try again.');

  let parsed: RawDraft;
  try { parsed = JSON.parse(json) as RawDraft; }
  catch { throw new Error('The assistant returned an unexpected response. Try again.'); }

  const name = str(parsed.name).trim();
  if (!name) throw new Error('The assistant did not return a world name. Try again.');

  const seed: WorldSeed = {
    factions: asArray(parsed.factions).map(f => ({ name: str(f.name), faction_type: str(f.faction_type) || null, overview: str(f.overview) || null })).filter(f => f.name),
    locations: asArray(parsed.locations).map(l => ({ name: str(l.name), location_type: str(l.location_type) || 'landmark', description: str(l.description) || null })).filter(l => l.name),
    npcs: asArray(parsed.npcs).map(n => ({ name: str(n.name), role: str(n.role) || null, description: str(n.description) || null })).filter(n => n.name),
    lore: asArray(parsed.lore).map(e => ({ title: str(e.title), category: str(e.category) || null, content: str(e.content) || null })).filter(e => e.title),
  };

  const summaryLines: { glyph: string; text: string }[] = [];
  if (seed.locations.length) summaryLines.push({ glyph: '✦', text: `${seed.locations.length} locations — ${seed.locations.slice(0, 3).map(l => l.name).join(', ')}${seed.locations.length > 3 ? '…' : ''}` });
  if (seed.npcs.length) summaryLines.push({ glyph: '◇', text: `${seed.npcs.length} NPCs — ${seed.npcs.slice(0, 3).map(n => n.name).join(', ')}${seed.npcs.length > 3 ? '…' : ''}` });
  if (seed.factions.length) summaryLines.push({ glyph: '◈', text: `${seed.factions.length} factions — ${seed.factions.map(f => f.name).join(', ')}` });
  if (seed.lore.length) summaryLines.push({ glyph: '❦', text: `${seed.lore.length} lore entries — ${seed.lore.map(l => l.title).join(', ')}` });

  return { name, tagline: str(parsed.tagline).trim(), seed, summaryLines };
}
