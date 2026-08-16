import { describe, it, expect, vi, beforeEach } from 'vitest';

// campaignSeeds imports `./db`, which imports `./supabase` — and supabase.ts
// throws at import time without VITE_SUPABASE_* env vars. Mock the db layer so
// these pure-function tests stay hermetic (no client, no env dependency).
vi.mock('./db', () => ({
  Sessions: { upsert: vi.fn() },
  PlayerCharacters: { upsert: vi.fn() },
  NPCs: { upsert: vi.fn() },
  Locations: { upsert: vi.fn() },
  Factions: { upsert: vi.fn() },
  Hooks: { upsert: vi.fn() },
  Lore: { upsert: vi.fn() },
  Modules: { upsert: vi.fn() },
  MonsterStatblocks: { upsert: vi.fn() },
}));

import {
  templateCounts, importActionsToHooks, summarizeSeedActions, seedCampaignEntities,
  CAMPAIGN_TEMPLATES, type CampaignTemplate,
} from './campaignSeeds';
import {
  Hooks as HooksDB, NPCs as NPCsDB, Locations as LocationsDB, Factions as FactionsDB,
} from './db';
import type { ImportAction } from './documentImport';

describe('templateCounts', () => {
  it('reports the hook count of a template', () => {
    expect(templateCounts({ hooks: [{ title: 'a' }, { title: 'b' }] } as unknown as CampaignTemplate)).toEqual({ hooks: 2 });
    expect(templateCounts({ hooks: [] } as unknown as CampaignTemplate)).toEqual({ hooks: 0 });
  });

  it('matches the real templates (derived, never drifts)', () => {
    expect(CAMPAIGN_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of CAMPAIGN_TEMPLATES) {
      expect(templateCounts(t)).toEqual({ hooks: t.hooks.length });
    }
  });
});

describe('importActionsToHooks', () => {
  const hookAction = (payload: Record<string, unknown>): ImportAction =>
    ({ type: 'upsertHook', payload } as unknown as ImportAction);

  it('maps upsertHook actions with a title into seed hooks', () => {
    const actions = [
      hookAction({ title: 'The Shard', category: 'main_plot', description: 'find it', state: 'active' }),
    ];
    expect(importActionsToHooks(actions)).toEqual([
      { title: 'The Shard', category: 'main_plot', description: 'find it', state: 'active' },
    ]);
  });

  it('ignores non-hook actions', () => {
    const actions = [
      { type: 'upsertNPC', payload: { name: 'Kutter' } } as unknown as ImportAction,
      hookAction({ title: 'A thread' }),
    ];
    const hooks = importActionsToHooks(actions);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].title).toBe('A thread');
  });

  it('skips hook actions with no title', () => {
    const actions = [hookAction({ description: 'orphaned, no title' })];
    expect(importActionsToHooks(actions)).toEqual([]);
  });

  it('returns an empty array for no actions', () => {
    expect(importActionsToHooks([])).toEqual([]);
  });
});

const action = (type: string, payload: Record<string, unknown>): ImportAction =>
  ({ type, payload } as unknown as ImportAction);

describe('summarizeSeedActions', () => {
  it('groups seedable creates by kind in display order', () => {
    const actions = [
      action('upsertNPC', { name: 'Kutter' }),
      action('upsertNPC', { name: 'Vess' }),
      action('upsertLocation', { name: 'The Reach' }),
      action('upsertHook', { title: 'The Shard' }),
    ];
    expect(summarizeSeedActions(actions)).toEqual([
      { type: 'upsertNPC', label: 'NPC', count: 2 },
      { type: 'upsertLocation', label: 'Location', count: 1 },
      { type: 'upsertHook', label: 'Plot Hook', count: 1 },
    ]);
  });

  it('excludes cross-referential and world-scoped kinds', () => {
    const actions = [
      action('upsertNPC', { name: 'Kutter' }),
      action('upsertRelationship', { label: 'allies' }),
      action('upsertScene', { title: 'The ambush' }),
      action('upsertTimelineEvent', { title: 'The Sundering' }),
    ];
    expect(summarizeSeedActions(actions)).toEqual([
      { type: 'upsertNPC', label: 'NPC', count: 1 },
    ]);
  });
});

describe('seedCampaignEntities', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('seeds every entity kind — not just hooks — against the new campaign id', async () => {
    await seedCampaignEntities('camp-1', [
      action('upsertNPC', { name: 'Kutter', role: 'guide' }),
      action('upsertLocation', { name: 'The Reach' }),
      action('upsertFaction', { name: 'The Wardens' }),
      action('upsertHook', { title: 'The Shard' }),
    ]);
    expect(NPCsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kutter', campaign_id: 'camp-1' }));
    expect(LocationsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'The Reach', campaign_id: 'camp-1' }));
    expect(FactionsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'The Wardens', campaign_id: 'camp-1' }));
    expect(HooksDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Shard', campaign_id: 'camp-1', state: 'seed' }));
  });

  it('drops any id from the payload so imports always create, never update', async () => {
    await seedCampaignEntities('camp-1', [
      action('upsertNPC', { id: 'stale-id', name: 'Kutter' }),
    ]);
    const arg = (NPCsDB.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty('id');
  });

  it('strips stray columns via normalizeAssistantPayload', async () => {
    await seedCampaignEntities('camp-1', [
      action('upsertNPC', { name: 'Kutter', key_npcs: 'not an NPC column' }),
    ]);
    const arg = (NPCsDB.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty('key_npcs');
  });

  it('is best-effort: a failed insert is skipped, not thrown', async () => {
    (NPCsDB.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(seedCampaignEntities('camp-1', [
      action('upsertNPC', { name: 'Explodes' }),
      action('upsertLocation', { name: 'Still seeded' }),
    ])).resolves.toBeUndefined();
    expect(LocationsDB.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Still seeded' }));
    errSpy.mockRestore();
  });
});
