import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

// A fake Supabase: rows by table, filtered by .in(), ordered and paged like the API.
const h = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  orders: [] as [string, string][],
  ranges: [] as [string, number][],
  files: {} as Record<string, Uint8Array>,
}));
vi.mock('./supabase', () => {
  const from = (table: string) => {
    let rows = h.rows[table] ?? [];
    const q = {
      select: () => q,
      in: (column: string, values: string[]) => { rows = rows.filter(r => values.includes(r[column] as string)); return q; },
      order: (column: string) => { h.orders.push([table, column]); rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column]))); return q; },
      range: (lo: number, hi: number) => { h.ranges.push([table, lo]); return Promise.resolve({ data: rows.slice(lo, hi + 1), error: null }); },
    };
    return q;
  };
  const download = (path: string) => Promise.resolve(h.files[path]
    ? { data: new Blob([h.files[path] as BlobPart]), error: null }
    : { data: null, error: new Error('not found') });
  return { supabase: { from, storage: { from: () => ({ download }) } } };
});

import { exportCampaign, exportFileName, gatherCampaign } from './campaignExport';

beforeEach(() => {
  h.orders = [];
  h.ranges = [];
  h.files = { 'u/kael.webp': new Uint8Array([1, 2, 3]) };
  h.rows = {
    campaigns: [{ id: 'c1', name: 'shadows', title: 'Shadows over Phandalin', world_id: 'w1' }, { id: 'c2', name: 'other' }],
    worlds: [{ id: 'w1', name: 'Faerûn', era: 'DR', calendar: 'DR', year: 1492, calendar_months: null, tagline: 'not exported' }],
    player_characters: [
      { id: 'p1', campaign_id: 'c1', character_name: 'Kael', is_active: true, portrait_path: 'u/kael.webp' },
      { id: 'p2', campaign_id: 'c2', character_name: 'Someone else' },
    ],
    npcs: [
      { id: 'n1', campaign_id: 'c1', name: 'Sable', portrait_path: 'u/gone.webp' },
      { id: 'n9', campaign_id: null, world_id: 'w1', name: 'Elminster' },
      { id: 'n8', campaign_id: null, world_id: 'w1', name: 'Not linked' },
    ],
    campaign_npcs: [{ campaign_id: 'c1', npc_id: 'n9' }],
    modules: [{ id: 'mo1', campaign_id: 'c1', title: 'Phandelver' }],
    submodules: [{ id: 'sm1', module_id: 'mo1', title: 'Cragmaw', sort_order: 0 }, { id: 'sm9', module_id: 'other', title: 'No' }],
    scenes: [{ id: 'sc1', submodule_id: 'sm1', title: 'Cave', sort_order: 0 }],
    session_recordings: [{ id: 'r1', campaign_id: 'c1', session_id: 's1' }],
    transcript_segments: Array.from({ length: 1001 }, (_, i) => ({ id: `t${String(i).padStart(4, '0')}`, recording_id: 'r1', start_ms: i, text: 'x' })),
  };
});

describe('gatherCampaign', () => {
  it('reads the campaign’s own records, their parts, and only the canon it links', async () => {
    const data = await gatherCampaign('c1');
    expect(data.campaign.name).toBe('shadows');
    expect(data.world).toEqual({ id: 'w1', name: 'Faerûn', era: 'DR', calendar: 'DR', year: 1492, calendar_months: null });
    expect(data.tables.player_characters.map(p => p.character_name)).toEqual(['Kael']);
    expect(data.tables.npcs.map(n => n.name)).toEqual(['Sable']);
    expect(data.tables.submodules.map(s => s.id)).toEqual(['sm1']);
    expect(data.tables.scenes.map(s => s.id)).toEqual(['sc1']);
    expect(data.canon.npcs.map(n => n.name)).toEqual(['Elminster']);
    expect(data.tables.items).toEqual([]);
  });

  it('pages through more than a thousand rows', async () => {
    const data = await gatherCampaign('c1');
    expect(data.tables.transcript_segments).toHaveLength(1001);
    expect(h.ranges.filter(([t]) => t === 'transcript_segments').map(([, lo]) => lo)).toEqual([0, 1000]);
  });

  it('orders link tables, which have no id, by what they link', async () => {
    await gatherCampaign('c1');
    expect(h.orders).toContainEqual(['campaign_npcs', 'npc_id']);
    expect(h.orders).toContainEqual(['campaign_lore', 'lore_id']);
    expect(h.orders).toContainEqual(['npcs', 'id']);
  });

  it('says so when the campaign isn’t there', async () => {
    await expect(gatherCampaign('nope')).rejects.toThrow('That campaign wasn’t found.');
  });
});

describe('exportCampaign', () => {
  it('packs Markdown, campaign.json and the pictures it could fetch into one folder', async () => {
    const steps: string[] = [];
    const out = await exportCampaign('c1', p => steps.push(p.step));
    expect(out.fileName).toMatch(/^shadows-over-phandalin-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(out.pictures).toBe(1);
    expect(out.missingPictures).toBe(1);
    expect([...new Set(steps)]).toEqual(['records', 'pictures', 'packing']);

    const zip = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
    const folder = out.fileName.replace(/\.zip$/, '');
    expect(Object.keys(zip).every(k => k.startsWith(`${folder}/`))).toBe(true);
    expect(zip[`${folder}/pictures/party/kael.webp`]).toEqual(new Uint8Array([1, 2, 3]));
    expect(zip[`${folder}/pictures/cast/sable.webp`]).toBeUndefined();
    expect(strFromU8(zip[`${folder}/README.md`])).toContain('1 picture couldn’t be fetched');
    expect(strFromU8(zip[`${folder}/Cast.md`])).not.toContain('pictures/cast/sable');
    expect(JSON.parse(strFromU8(zip[`${folder}/campaign.json`])).tables.player_characters[0].id).toBe('p1');
    expect(zip[`${folder}/transcripts/session-01.md`]).toBeUndefined(); // no session row to hang it on
  });
});

describe('exportFileName', () => {
  it('names the zip for the campaign and the day', () => {
    expect(exportFileName({ name: 'shadows', title: 'Shadows over Phandalin' }, '2026-11-02')).toBe('shadows-over-phandalin-2026-11-02.zip');
    expect(exportFileName({ name: '', title: null }, '2026-11-02')).toBe('campaign-2026-11-02.zip');
  });
});
