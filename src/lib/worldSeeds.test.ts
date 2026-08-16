import { describe, it, expect, vi, beforeEach } from 'vitest';

// worldSeeds imports `./db`, which imports `./supabase` — and supabase.ts throws
// at import time without VITE_SUPABASE_* env vars. Mock the db layer so these
// tests stay hermetic (no client, no env dependency).
vi.mock('./db', () => ({
  NPCs: { upsert: vi.fn() },
  Factions: { upsert: vi.fn() },
  Locations: { upsert: vi.fn() },
  Lore: { upsert: vi.fn() },
}));

import { importActionsToSeed, seedTotal, seedWorldEntities, summarizeWorldSeed, type WorldSeed } from './worldSeeds';
import { NPCs as NPCsDB, Locations as LocationsDB } from './db';
import type { ImportAction } from './documentImport';

const action = (type: string, payload: Record<string, unknown>): ImportAction =>
  ({ type, payload } as unknown as ImportAction);

describe('importActionsToSeed', () => {
  it('maps the world-relevant entities out of a parsed document', () => {
    const seed = importActionsToSeed([
      action('upsertNPC', { name: 'Sethri Vael', role: 'Archivist' }),
      action('upsertLocation', { name: 'The Drowned Library' }),
      action('upsertFaction', { name: 'The Tide Court' }),
      action('upsertLore', { title: 'The First Silence' }),
    ]);
    expect(seed.npcs).toHaveLength(1);
    expect(seed.locations).toHaveLength(1);
    expect(seed.factions).toHaveLength(1);
    expect(seed.lore).toHaveLength(1);
  });

  it('ignores campaign-scoped actions (sessions, modules, campaigns)', () => {
    const seed = importActionsToSeed([
      action('upsertCampaign', { name: 'The Silence Beneath' }),
      action('upsertSession', { session_number: 1 }),
      action('upsertModule', { title: 'Chapter 1' }),
    ]);
    expect(seedTotal(seed)).toBe(0);
  });
});

describe('seedTotal', () => {
  it('counts the world entity kinds', () => {
    const seed: WorldSeed = {
      factions: [{ name: 'a' }],
      locations: [],
      npcs: [{ name: 'b' }],
      lore: [{ title: 'c' }],
    };
    expect(seedTotal(seed)).toBe(3);
  });
});

describe('summarizeWorldSeed', () => {
  it('breaks the seed down by kind, omitting empty kinds', () => {
    const seed: WorldSeed = {
      npcs: [{ name: 'a' }, { name: 'b' }],
      locations: [{ name: 'c' }],
      factions: [],
      lore: [{ title: 'd' }],
    };
    expect(summarizeWorldSeed(seed)).toEqual([
      { type: 'upsertNPC', label: 'NPC', glyph: expect.any(String), count: 2 },
      { type: 'upsertLocation', label: 'Location', glyph: expect.any(String), count: 1 },
      { type: 'upsertLore', label: 'Lore', glyph: expect.any(String), count: 1 },
    ]);
  });

  it('returns an empty array for an empty seed', () => {
    expect(summarizeWorldSeed({ npcs: [], locations: [], factions: [], lore: [] })).toEqual([]);
  });
});

describe('seedWorldEntities', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('inserts each world entity scoped to the new world with a null campaign_id', async () => {
    await seedWorldEntities('world-1', {
      factions: [], locations: [{ name: 'The Reach' }], npcs: [{ name: 'Kutter' }], lore: [],
    });
    expect(NPCsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kutter', world_id: 'world-1', campaign_id: null }));
    expect(LocationsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'The Reach', world_id: 'world-1', campaign_id: null }));
  });

  it('is best-effort: a failed insert is skipped, not thrown', async () => {
    (NPCsDB.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(seedWorldEntities('world-1', {
      factions: [], locations: [{ name: 'Still seeded' }], npcs: [{ name: 'Explodes' }], lore: [],
    })).resolves.toBeUndefined();
    expect(LocationsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Still seeded' }));
    errSpy.mockRestore();
  });
});
