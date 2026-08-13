// generateCampaign.ts
// ---------------------------------------------------------------------------
// The Campaign-creation gate's "Generate with the Assistant" path. Calls the
// same /api/chat streaming endpoint as generateWorld.ts, with a system prompt
// pinned to a single JSON object describing a campaign draft (name, premise,
// party, and a few starter threads).
// ---------------------------------------------------------------------------

import { authHeaders } from './apiClient';
import { getAIProvider } from './aiProvider';
import type { SeedHook } from './campaignSeeds';

export interface CampaignDraft {
  name: string;
  premise: string;
  party: string;
  hooks: SeedHook[];
  /** Short "N starter threads — …" style lines for the result card. */
  summaryLines: { glyph: string; text: string }[];
}

const SYSTEM = `You are a tabletop RPG campaign assistant. Given a one- or two-sentence idea
(and possibly the setting it takes place in), draft the bones of a campaign.
Respond with a SINGLE JSON object and NOTHING else — no prose, no code fences.

Shape:
{
  "name": string,        // evocative campaign title, 2-5 words
  "premise": string,     // 2-4 sentence pitch: the situation, the stakes, what the party does
  "party": string,       // one sentence describing the starting party (size, level, why they're together)
  "hooks": [             // 3-4 starter plot threads
    { "title": string, "category": string, "description": string }  // category: main_plot | side_quest | character_arc | faction
  ]
}

Keep strings concise (premise under ~500 chars, hook descriptions under ~200). Return only the JSON.`;

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
    else if (event.type === 'error') throw new Error(event.message ?? 'The assistant could not draft a campaign.');
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
  premise?: unknown;
  party?: unknown;
  hooks?: unknown;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function generateCampaignDraft(prompt: string, signal?: AbortSignal): Promise<CampaignDraft> {
  const text = await streamChatText(prompt, signal);
  const json = extractJsonObject(text);
  if (!json) throw new Error('The assistant returned an unexpected response. Try again.');

  let parsed: RawDraft;
  try { parsed = JSON.parse(json) as RawDraft; }
  catch { throw new Error('The assistant returned an unexpected response. Try again.'); }

  const name = str(parsed.name).trim();
  if (!name) throw new Error('The assistant did not return a campaign name. Try again.');

  const hooks: SeedHook[] = asArray(parsed.hooks)
    .map(h => ({ title: str(h.title), category: str(h.category) || null, description: str(h.description) || null }))
    .filter(h => h.title);

  const summaryLines: { glyph: string; text: string }[] = [];
  if (hooks.length) {
    summaryLines.push({ glyph: '❧', text: `${hooks.length} starter thread${hooks.length === 1 ? '' : 's'} — ${hooks.slice(0, 3).map(h => h.title).join(', ')}${hooks.length > 3 ? '…' : ''}` });
  }

  return { name, premise: str(parsed.premise).trim(), party: str(parsed.party).trim(), hooks, summaryLines };
}
