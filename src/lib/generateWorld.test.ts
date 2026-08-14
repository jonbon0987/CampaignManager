import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./apiClient', () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));
vi.mock('./aiProvider', () => ({ getAIProvider: vi.fn(() => 'anthropic') }));

import { generateWorldDraft } from './generateWorld';
import { sseChunks, sseError, httpError } from '../test/sse';

const mockFetch = (resp: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp));
afterEach(() => vi.unstubAllGlobals());

const FULL_DRAFT = {
  name: 'Aldermere',
  tagline: '  A drowned empire that refuses to sink  ',
  factions: [
    { name: 'The Tide Wardens', faction_type: 'religious', overview: 'keepers of the shore' },
    { name: 'Saltless Court' }, // missing type/overview → nulls
    { faction_type: 'guild' },  // no name → filtered out
  ],
  locations: [
    { name: 'Saltmarsh', location_type: 'city', description: 'a wet town' },
    { name: 'The Deep', description: 'no type given' }, // → 'landmark'
    { name: 'Cair' }, { name: 'Vela' }, { name: 'Mor' }, // pushes count past 3
  ],
  npcs: [{ name: 'Mara', role: 'captain', description: 'stern' }],
  lore: 'not an array', // → []
};

describe('generateWorldDraft — happy path shaping', () => {
  it('extracts the JSON from noisy output and normalizes the draft', async () => {
    mockFetch(sseChunks(`Sure! ${JSON.stringify(FULL_DRAFT)} — hope this helps`));
    const draft = await generateWorldDraft('a drowned empire');

    expect(draft.name).toBe('Aldermere');
    expect(draft.tagline).toBe('A drowned empire that refuses to sink'); // trimmed

    // factions: empty-name entry dropped; missing fields → null
    expect(draft.seed.factions).toEqual([
      { name: 'The Tide Wardens', faction_type: 'religious', overview: 'keepers of the shore' },
      { name: 'Saltless Court', faction_type: null, overview: null },
    ]);

    // locations: missing location_type defaults to 'landmark'
    expect(draft.seed.locations).toHaveLength(5);
    expect(draft.seed.locations[1]).toEqual({ name: 'The Deep', location_type: 'landmark', description: 'no type given' });

    expect(draft.seed.npcs).toEqual([{ name: 'Mara', role: 'captain', description: 'stern' }]);
    expect(draft.seed.lore).toEqual([]); // non-array coerced to empty
  });

  it('builds summary lines with counts, a 3-item cap, and an ellipsis', async () => {
    mockFetch(sseChunks(JSON.stringify(FULL_DRAFT)));
    const { summaryLines } = await generateWorldDraft('x');

    const byGlyph = Object.fromEntries(summaryLines.map(s => [s.glyph, s.text]));
    expect(byGlyph['✦']).toBe('5 locations — Saltmarsh, The Deep, Cair…'); // capped at 3 + …
    expect(byGlyph['◇']).toBe('1 NPCs — Mara');
    expect(byGlyph['◈']).toBe('2 factions — The Tide Wardens, Saltless Court');
    expect(byGlyph['❦']).toBeUndefined(); // no lore → no line
  });

  it('accumulates text split across multiple stream chunks', async () => {
    const json = JSON.stringify({ name: 'Split', tagline: 't', locations: [{ name: 'One' }] });
    const mid = Math.floor(json.length / 2);
    mockFetch(sseChunks(json.slice(0, mid), json.slice(mid)));
    const draft = await generateWorldDraft('x');
    expect(draft.name).toBe('Split');
    expect(draft.seed.locations).toEqual([{ name: 'One', location_type: 'landmark', description: null }]);
  });
});

describe('generateWorldDraft — error handling', () => {
  it('throws when the response contains no JSON object', async () => {
    mockFetch(sseChunks('the assistant rambled with no json'));
    await expect(generateWorldDraft('x')).rejects.toThrow(/unexpected response/);
  });

  it('throws when the JSON is malformed', async () => {
    mockFetch(sseChunks('{ "name": "X", broken'));
    await expect(generateWorldDraft('x')).rejects.toThrow(/unexpected response/);
  });

  it('throws when the draft has no name', async () => {
    mockFetch(sseChunks(JSON.stringify({ tagline: 'no name here' })));
    await expect(generateWorldDraft('x')).rejects.toThrow(/did not return a world name/);
  });

  it('surfaces a mid-stream error event', async () => {
    mockFetch(sseError('model exploded'));
    await expect(generateWorldDraft('x')).rejects.toThrow('model exploded');
  });

  it('throws the server error message on a non-ok response', async () => {
    mockFetch(httpError(500, { error: 'rate limited' }));
    await expect(generateWorldDraft('x')).rejects.toThrow('rate limited');
  });
});
