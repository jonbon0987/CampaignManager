import { describe, it, expect } from 'vitest';
import { applyProposals, undoApplied, retarget, entityPayload, effectiveAction, type ChronicleWriter, type AppliedLike, type ProposalLike } from './applyChronicle';
import { sessionToAudioMs, audioToSessionMs } from './transcript';
import type { EntityChange, SessionFieldChange } from './chronicle';

// An in-memory campaign plus the applied log, standing in for the database.
function fakeCampaign() {
  const rows = new Map<string, Record<string, unknown>>([
    ['s1', { id: 's1', session_number: 4, summary: 'DM notes from the night.' }],
    ['npc-brenna', { id: 'npc-brenna', campaign_id: 'c1', name: 'Brenna', status: 'active', disposition: 'Wary', description: 'A stern harbormaster.', met_by_pcs: false }],
    ['hook-1', { id: 'hook-1', campaign_id: 'c1', title: 'Where is Gorval?', state: 'seed', is_active: true, description: null }],
  ]);
  const entries = new Map<string, Record<string, unknown>>();
  const log: AppliedLike[] = [];
  const statuses = new Map<string, string>();
  let n = 0;
  const writer: ChronicleWriter & { markUndone: (id: string) => Promise<void> } = {
    existing: (_k, id) => (rows.has(id) ? { ...rows.get(id)! } : null),
    write: async (kind, payload) => {
      if (payload.name === 'FAIL') throw new Error('write failed');
      const id = (payload.id as string) ?? `new-${kind}-${++n}`;
      rows.set(id, { ...(rows.get(id) ?? {}), ...payload, id });
      return id;
    },
    remove: async (_k, id) => { rows.delete(id); },
    addEntry: async e => { const id = `entry-${++n}`; entries.set(id, e); return id; },
    removeEntry: async id => { entries.delete(id); },
    logApplied: async r => { log.push({ id: `log-${log.length + 1}`, undone_at: null, ...r }); },
    setStatus: async (id, s) => { statuses.set(id, s); },
    markUndone: async id => { const r = log.find(l => l.id === id)!; r.undone_at = 'now'; },
  };
  return { rows, entries, log, statuses, writer };
}

const entity = (over: Partial<EntityChange>): EntityChange => ({
  kind: 'entity', entity_type: 'npc', matched_id: null, name: 'X', set: {}, append: {}, entry: null, reasoning: '', confidence: 0.9, ...over,
});
const proposal = (id: string, action: EntityChange | SessionFieldChange, edits: EntityChange | SessionFieldChange | null = null): ProposalLike => ({
  id, action: action as unknown as Record<string, unknown>, edits: edits ? { action: edits } : null, source_ms: 9_500, source_quote: '"Gorval never returned."',
});

describe('applyProposals', () => {
  it('updates an existing NPC, adds new details to its description, and logs what it replaced', async () => {
    const c = fakeCampaign();
    const res = await applyProposals([proposal('p1', entity({ matched_id: 'npc-brenna', name: 'Brenna', set: { disposition: 'Fearful ally', met_by_pcs: true }, append: { description: 'Owes the Grey Hand.' }, entry: 'Told the party about Gorval.' }))], c.writer);
    expect(res).toEqual({ applied: ['p1'], failed: [] });
    expect(c.rows.get('npc-brenna')).toMatchObject({ disposition: 'Fearful ally', met_by_pcs: true, description: 'A stern harbormaster.\n\nOwes the Grey Hand.', name: 'Brenna' });
    expect([...c.entries.values()][0]).toMatchObject({ entity_type: 'npc', entity_id: 'npc-brenna', text: 'Told the party about Gorval.', source_ms: 9_500 });
    expect(c.log.map(l => [l.entity_table, l.operation])).toEqual([['npcs', 'update'], ['entity_session_entries', 'create']]);
    expect(c.log[0].before).toMatchObject({ disposition: 'Wary', description: 'A stern harbormaster.' });
    expect(c.statuses.get('p1')).toBe('applied');
  });

  it('creates a new entry and attaches its session history to the new id', async () => {
    const c = fakeCampaign();
    await applyProposals([proposal('p1', entity({ name: 'Tamsin', set: { name: 'Tamsin', status: 'active', met_by_pcs: true }, entry: 'Rowed the party across.' }))], c.writer);
    const created = c.log[0];
    expect(created).toMatchObject({ entity_table: 'npcs', operation: 'create', before: null });
    expect(c.rows.get(created.entity_id)).toMatchObject({ name: 'Tamsin', faction_ids: [] });
    expect([...c.entries.values()][0]).toMatchObject({ entity_id: created.entity_id });
  });

  it('adds to session fields the DM already wrote instead of replacing them', async () => {
    const c = fakeCampaign();
    const summary: SessionFieldChange = { kind: 'session', session_id: 's1', field: 'summary', value: 'The party reached the docks.', reasoning: '', confidence: 0.9 };
    await applyProposals([proposal('p1', summary)], c.writer);
    expect(c.rows.get('s1')?.summary).toBe('DM notes from the night.\n\nThe party reached the docks.');
    expect(c.log[0].before).toEqual({ id: 's1', summary: 'DM notes from the night.' });
  });

  it('uses the DM’s edits over the original proposal', async () => {
    const c = fakeCampaign();
    const original = entity({ matched_id: 'npc-brenna', name: 'Brenna', set: { disposition: 'Hostile' } });
    await applyProposals([proposal('p1', original, { ...original, set: { disposition: 'Friendly' } })], c.writer);
    expect(c.rows.get('npc-brenna')?.disposition).toBe('Friendly');
  });

  it('keeps going past a failure and reports it', async () => {
    const c = fakeCampaign();
    const res = await applyProposals([
      proposal('bad', entity({ name: 'FAIL', set: { name: 'FAIL' } })),
      proposal('gone', entity({ matched_id: 'npc-deleted', name: 'Old Wick' })),
      proposal('ok', entity({ matched_id: 'hook-1', entity_type: 'hook', name: 'Where is Gorval?', set: { state: 'active' } })),
    ], c.writer);
    expect(res.applied).toEqual(['ok']);
    expect(res.failed.map(f => f.id)).toEqual(['bad', 'gone']);
    expect(res.failed[1].message).toMatch(/no longer exists/);
  });
});

describe('undoApplied', () => {
  it('puts the campaign back exactly and returns proposals to accepted', async () => {
    const c = fakeCampaign();
    const before = new Map([...c.rows].map(([k, v]) => [k, { ...v }]));
    await applyProposals([
      proposal('p1', entity({ matched_id: 'npc-brenna', name: 'Brenna', set: { disposition: 'Fearful ally' }, entry: 'Spoke.' })),
      proposal('p2', entity({ name: 'Tamsin', set: { name: 'Tamsin' }, entry: 'Rowed.' })),
      proposal('p3', { kind: 'session', session_id: 's1', field: 'summary', value: 'More.', reasoning: '', confidence: 1 }),
    ], c.writer);

    const res = await undoApplied(c.log, c.writer);
    expect(res).toEqual({ undone: 5, failed: [] }); // 2 for Brenna, 2 for Tamsin, 1 for the recap
    expect(new Map([...c.rows].map(([k, v]) => [k, v]))).toEqual(before);
    expect(c.entries.size).toBe(0);
    expect([...c.statuses.values()]).toEqual(['accepted', 'accepted', 'accepted']);
    expect(c.log.every(l => l.undone_at)).toBe(true);
  });

  it('skips rows already undone', async () => {
    const c = fakeCampaign();
    await applyProposals([proposal('p1', entity({ name: 'Tamsin', set: { name: 'Tamsin' } }))], c.writer);
    await undoApplied(c.log, c.writer);
    expect((await undoApplied(c.log, c.writer)).undone).toBe(0);
  });
});

describe('retarget', () => {
  it('moves a new entry onto an existing one: its description becomes added text', () => {
    const a = entity({ name: 'Tamsin', set: { name: 'Tamsin', role: 'Ferryman', description: 'Takes stories as fare.', disposition: 'Friendly' }, entry: 'Rowed us.' });
    const r = retarget(a, 'npc-brenna', 'Brenna');
    expect(r).toMatchObject({ matched_id: 'npc-brenna', name: 'Brenna', set: { disposition: 'Friendly' }, append: { description: 'Takes stories as fare.' }, entry: 'Rowed us.' });
  });

  it('turns an update into a new entry with that name', () => {
    const a = entity({ entity_type: 'hook', matched_id: 'hook-1', name: 'Where is Gorval?', set: { state: 'active' }, append: { description: 'Last seen with Sable.' } });
    const r = retarget(a, null, 'The sealed letter');
    expect(r.set).toEqual({ state: 'active', title: 'The sealed letter', description: 'Last seen with Sable.', is_active: true });
    expect(r.append).toEqual({});
  });

  it('effectiveAction prefers edits', () => {
    const a = entity({ name: 'A' });
    expect(effectiveAction(proposal('p', a, { ...a, name: 'B' })).kind).toBe('entity');
    expect((effectiveAction(proposal('p', a, { ...a, name: 'B' })) as EntityChange).name).toBe('B');
  });

  it('entityPayload leaves fields the change doesn’t touch alone', () => {
    expect(entityPayload(entity({ matched_id: 'x', set: { disposition: 'Calm' } }), { id: 'x', name: 'Keep', description: 'Keep' }))
      .toEqual({ id: 'x', name: 'Keep', description: 'Keep', disposition: 'Calm' });
  });
});

describe('sessionToAudioMs', () => {
  const chunks = [{ seq: 0, start_ms: 0, duration_ms: 60_000 }, { seq: 1, start_ms: 90_000, duration_ms: 20_000 }];
  it('inverts audioToSessionMs, and maps a moment in a pause to where audio resumes', () => {
    for (const audio of [0, 30_000, 65_000, 79_000]) expect(sessionToAudioMs(audioToSessionMs(audio, chunks, 5_000), chunks, 5_000)).toBe(audio);
    expect(sessionToAudioMs(75_000, chunks, 0)).toBe(60_000);
    expect(sessionToAudioMs(42_000, [], 2_000)).toBe(40_000);
  });
});
