import { describe, it, expect, vi } from 'vitest';

// campaignSeeds imports `./db`, which imports `./supabase` — and supabase.ts
// throws at import time without VITE_SUPABASE_* env vars. Mock the db layer so
// these pure-function tests stay hermetic (no client, no env dependency).
vi.mock('./db', () => ({ Hooks: { upsert: vi.fn() } }));

import { templateCounts, importActionsToHooks, CAMPAIGN_TEMPLATES } from './campaignSeeds';
import type { ImportAction } from './documentImport';

describe('templateCounts', () => {
  it('reports the hook count of a template', () => {
    expect(templateCounts({ hooks: [{ title: 'a' }, { title: 'b' }] } as any)).toEqual({ hooks: 2 });
    expect(templateCounts({ hooks: [] } as any)).toEqual({ hooks: 0 });
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
