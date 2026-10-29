import { describe, it, expect } from 'vitest';
import { buildChronicle, changeCount, changeText, plainList, talkShare, whatChanged, type WrittenItem } from './chronicleView';
import { trackAt } from './transcript';
import type { AppliedLike, ProposalLike } from './applyChronicle';

const proposal = (id: string, action: Record<string, unknown>, status = 'applied', edits: Record<string, unknown> | null = null): ProposalLike & { status: string } => ({
  id, action, edits, status, source_ms: 1_000, source_quote: '"A line."',
});
const npc = (over: Record<string, unknown>) => ({ kind: 'entity', entity_type: 'npc', matched_id: null, name: 'X', set: {}, append: {}, entry: null, reasoning: '', confidence: 0.9, ...over });
const logRow = (proposal_id: string, entity_table: string, entity_id: string, operation: 'create' | 'update', before: Record<string, unknown> | null = null, undone_at: string | null = null): AppliedLike => ({
  id: `${proposal_id}-${entity_table}`, proposal_id, entity_table, entity_id, operation, before, undone_at,
});

describe('buildChronicle', () => {
  it('describes an update against what it replaced, and links a new entry to the id it was given', () => {
    const m = buildChronicle([
      proposal('p1', npc({ matched_id: 'oren', name: 'Oren', set: { disposition: 'Fearful ally', status: 'active' }, append: { description: 'Afraid of the Lamp.' }, entry: 'Admitted the key.' })),
      proposal('p2', npc({ name: 'Tamsin', set: { name: 'Tamsin', status: 'active', disposition: 'Friendly', description: 'A ferryman.' }, entry: 'Rowed us.' })),
    ], [
      logRow('p1', 'npcs', 'oren', 'update', { id: 'oren', disposition: 'Wary', status: 'active' }),
      logRow('p1', 'entity_session_entries', 'e1', 'create'),
      logRow('p2', 'npcs', 'new-tamsin', 'create'),
    ]);
    expect(m.byKind.npc).toEqual([
      expect.objectContaining({ entityId: 'oren', created: false, entry: 'Admitted the key.', added: 'Afraid of the Lamp.', changes: [{ field: 'disposition', from: 'Wary', to: 'Fearful ally' }] }),
      expect.objectContaining({ entityId: 'new-tamsin', created: true, added: 'A ferryman.', changes: [{ field: 'disposition', from: null, to: 'Friendly' }, { field: 'status', from: null, to: 'active' }] }),
    ]);
    expect(m.written).toBe(2);
  });

  it('leaves out proposals that weren’t applied, counts edits and skips, and ignores undone log rows', () => {
    const m = buildChronicle([
      proposal('p1', npc({ matched_id: 'a', name: 'A', set: { disposition: 'Calm' } }), 'applied', { action: npc({ matched_id: 'a', name: 'A', set: { disposition: 'Calmer' } }) }),
      proposal('p2', npc({ name: 'B' }), 'skipped'),
      proposal('p3', npc({ name: 'C' }), 'accepted'),
      proposal('p4', { kind: 'session', session_id: 's', field: 'summary', value: 'x', reasoning: '', confidence: 1 }),
    ], [logRow('p1', 'npcs', 'a', 'update', { disposition: 'Old' }, 'yesterday')]);
    expect(m.byKind.npc.map(i => i.name)).toEqual(['A']);
    expect(m.byKind.npc[0].changes).toEqual([{ field: 'disposition', from: null, to: 'Calmer' }]);
    expect(m).toMatchObject({ written: 2, edited: 1, skipped: 1, sessionFields: ['summary'] });
  });

  it('files a thread’s state change', () => {
    const m = buildChronicle([proposal('h', { ...npc({}), entity_type: 'hook', matched_id: 'h1', name: 'Who stole it?', set: { state: 'active' } })], [logRow('h', 'hooks', 'h1', 'update', { state: 'seed' })]);
    expect(m.byKind.hook[0].changes).toEqual([{ field: 'state', from: 'seed', to: 'active' }]);
  });
});

describe('talkShare', () => {
  const line = (pc_id: string | null, ms: number, is_dm = false) => ({ pc_id, is_dm, start_ms: 0, end_ms: ms });
  it('shares the players’ talk time, without the DM, and flags a quiet player', () => {
    const { share, quiet } = talkShare([line('a', 6_000), line('b', 3_000), line('c', 1_000), line(null, 99_000, true)]);
    expect(share.get('a')).toBeCloseTo(0.6);
    expect(share.get('c')).toBeCloseTo(0.1);
    expect([...quiet]).toEqual(['c']);
  });
  it('counts a player who was there but never spoke', () => {
    const { share, quiet } = talkShare([line('a', 1_000)], ['a', 'b']);
    expect(share.get('b')).toBe(0);
    expect(quiet.has('b')).toBe(true);
  });
  it('has nothing to say about one player, or none', () => {
    expect(talkShare([line('a', 1_000)]).quiet.size).toBe(0);
    expect(talkShare([]).share.size).toBe(0);
  });
});

describe('trackAt', () => {
  const t = (id: string, source: 'table' | 'discord' | 'upload', offset_ms: number, storage_path: string | null = 'x') => ({ id, source, offset_ms, storage_path });
  it('plays the room over a Discord voice, from the track running at that moment', () => {
    const tracks = [t('discord', 'discord', 0), t('table1', 'table', 0), t('table2', 'table', 60_000), t('unjoined', 'table', 90_000, null)];
    expect(trackAt(tracks, 30_000)?.id).toBe('table1');
    expect(trackAt(tracks, 95_000)?.id).toBe('table2');
    expect(trackAt([t('discord', 'discord', 5_000)], 0)?.id).toBe('discord');
    expect(trackAt([], 0)).toBeNull();
  });
});

describe('describing a change', () => {
  const item = (over: Partial<WrittenItem>): WrittenItem => ({
    proposalId: 'p', kind: 'npc', entityId: 'n', name: 'Oren', created: false, entry: null, added: null, changes: [], sourceMs: null, quote: null, ...over,
  });

  it('says what a write changed, and how many things', () => {
    const oren = item({ entry: 'Met.', added: 'Scarred.', changes: [{ field: 'disposition', from: 'wary', to: 'fearful ally' }] });
    expect(whatChanged(oren)).toBe('Attitude · Description · Session history');
    expect(changeCount(oren)).toBe(3);
    expect(changeText(oren.changes[0])).toBe('Wary → Fearful ally');
    expect(whatChanged(item({ created: true }))).toBe('Created new');
    expect(whatChanged(item({ kind: 'hook', changes: [{ field: 'state', from: 'seed', to: 'active' }] }))).toBe('Seed → Active');
  });

  it('reads a plain markdown list, and nothing richer', () => {
    expect(plainList('- The warded stair\n* Roe’s favor\n')).toEqual(['The warded stair', 'Roe’s favor']);
    expect(plainList('The party stopped.\n- One')).toBeNull();
    expect(plainList('')).toBeNull();
  });
});
