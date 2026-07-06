import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useLinkableGlobals,
  mergeLinkableGlobals,
  resolveScopeCampaignId,
  type LinkableGlobalsConfig,
} from './useLinkableGlobals';

// --- Test fixtures: a tiny in-memory backend matching the DB shape ---

interface Row {
  id: string;
  name: string;
  campaign_id: string | null;
}
type RowInsert = { name?: string; campaign_id?: string | null; id?: string };

function makeBackend() {
  const rows = new Map<string, Row>();
  const links = new Set<string>(); // key: `${campaignId}:${id}`
  let seq = 0;

  const seedCampaign = (cid: string, name: string): Row => {
    const id = `c-${++seq}`;
    const row = { id, name, campaign_id: cid };
    rows.set(id, row);
    return row;
  };
  const seedGlobal = (name: string): Row => {
    const id = `g-${++seq}`;
    const row = { id, name, campaign_id: null };
    rows.set(id, row);
    return row;
  };

  const config: LinkableGlobalsConfig<Row, RowInsert> = {
    getByCampaign: vi.fn(async (cid: string) =>
      [...rows.values()].filter((r) => r.campaign_id === cid)
    ),
    getGlobal: vi.fn(async () => [...rows.values()].filter((r) => r.campaign_id === null)),
    getLinkedIds: vi.fn(async (cid: string) =>
      [...links].filter((k) => k.startsWith(`${cid}:`)).map((k) => k.split(':')[1])
    ),
    upsert: vi.fn(async (data: RowInsert & { id?: string }) => {
      const id = data.id ?? `row-${++seq}`;
      const row: Row = { id, name: data.name ?? '', campaign_id: data.campaign_id ?? null };
      rows.set(id, row);
      return row;
    }),
    remove: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
    link: vi.fn(async (cid: string, id: string) => {
      links.add(`${cid}:${id}`);
    }),
    unlink: vi.fn(async (cid: string, id: string) => {
      links.delete(`${cid}:${id}`);
    }),
  };

  return { config, rows, links, seedCampaign, seedGlobal };
}

// =====================================================================
// Pure logic — the merge pattern (highest-value smoke coverage)
// =====================================================================

describe('mergeLinkableGlobals', () => {
  const c1 = { id: 'c1', name: 'Campaign NPC' };
  const g1 = { id: 'g1', name: 'Global Linked' };
  const g2 = { id: 'g2', name: 'Global Unlinked' };

  it('includes only linked globals, never unlinked ones', () => {
    const merged = mergeLinkableGlobals([c1], [g1, g2], ['g1']);
    expect(merged).toEqual([c1, g1]);
    expect(merged).not.toContainEqual(g2);
  });

  it('keeps campaign rows first, then linked globals', () => {
    const merged = mergeLinkableGlobals([c1], [g1], ['g1']);
    expect(merged[0]).toBe(c1);
    expect(merged[1]).toBe(g1);
  });

  it('returns only campaign rows when nothing is linked', () => {
    expect(mergeLinkableGlobals([c1], [g1, g2], [])).toEqual([c1]);
  });

  it('ignores linkedIds that do not match any global', () => {
    expect(mergeLinkableGlobals([c1], [g1], ['ghost'])).toEqual([c1]);
  });

  it('handles empty inputs', () => {
    expect(mergeLinkableGlobals([], [], [])).toEqual([]);
  });
});

describe('resolveScopeCampaignId', () => {
  it('returns the selected campaign for campaign scope', () => {
    expect(resolveScopeCampaignId('campaign', 'abc')).toBe('abc');
  });
  it('returns null for global scope', () => {
    expect(resolveScopeCampaignId('global', 'abc')).toBeNull();
  });
});

// =====================================================================
// Hook integration — upsert / link / unlink / refresh
// =====================================================================

describe('useLinkableGlobals', () => {
  let backend: ReturnType<typeof makeBackend>;
  beforeEach(() => {
    backend = makeBackend();
  });

  it('refresh loads campaign + global + linked, and merges correctly', async () => {
    backend.seedCampaign('camp', 'Camp NPC');
    const linked = backend.seedGlobal('Linked Global');
    backend.seedGlobal('Unlinked Global');
    backend.links.add(`camp:${linked.id}`);

    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.refresh('camp');
    });

    expect(result.current.campaignItems).toHaveLength(1);
    expect(result.current.globalItems).toHaveLength(2);
    expect(result.current.linkedIds).toEqual([linked.id]);
    // merged = campaign row + the single linked global (not the unlinked one)
    expect(result.current.items.map((r) => r.name)).toEqual(['Camp NPC', 'Linked Global']);
  });

  it('upsert with campaign scope writes the selected campaign_id', async () => {
    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.upsert({ name: 'New NPC' });
    });
    expect(backend.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New NPC', campaign_id: 'camp' })
    );
    expect(result.current.campaignItems.map((r) => r.name)).toContain('New NPC');
  });

  it('upsert with global scope writes a null campaign_id', async () => {
    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.upsert({ name: 'Shared NPC' }, 'global');
    });
    expect(backend.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Shared NPC', campaign_id: null })
    );
    expect(result.current.globalItems.map((r) => r.name)).toContain('Shared NPC');
  });

  it('upsert is a no-op when no campaign is selected', async () => {
    const { result } = renderHook(() => useLinkableGlobals(backend.config, null));
    await act(async () => {
      await result.current.upsert({ name: 'Should not save' });
    });
    expect(backend.config.upsert).not.toHaveBeenCalled();
  });

  it('link optimistically adds to linkedIds and the merged list', async () => {
    const g = backend.seedGlobal('Global To Link');
    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.refresh('camp');
    });
    expect(result.current.items).toHaveLength(0);

    await act(async () => {
      await result.current.link(g.id);
    });
    expect(backend.config.link).toHaveBeenCalledWith('camp', g.id);
    expect(result.current.linkedIds).toContain(g.id);
    expect(result.current.items.map((r) => r.name)).toEqual(['Global To Link']);
  });

  it('unlink removes from linkedIds and the merged list', async () => {
    const g = backend.seedGlobal('Linked');
    backend.links.add(`camp:${g.id}`);
    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.refresh('camp');
    });
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      await result.current.unlink(g.id);
    });
    expect(backend.config.unlink).toHaveBeenCalledWith('camp', g.id);
    expect(result.current.linkedIds).not.toContain(g.id);
    expect(result.current.items).toHaveLength(0);
  });

  it('remove deletes the row and refreshes', async () => {
    const row = backend.seedCampaign('camp', 'Doomed NPC');
    const { result } = renderHook(() => useLinkableGlobals(backend.config, 'camp'));
    await act(async () => {
      await result.current.refresh('camp');
    });
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      await result.current.remove(row.id);
    });
    expect(backend.config.remove).toHaveBeenCalledWith(row.id);
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });
});
