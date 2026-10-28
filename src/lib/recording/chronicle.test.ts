import { describe, it, expect } from 'vitest';
import { itemsToProposals, formatTranscript, normalizeConfidence, type KnownIds, type EntityChange, type SessionFieldChange } from './chronicle';

const lines = [
  { start_ms: 1_000, speaker: 'DM', text: 'The rain hammers the docks as Brenna Coldwater steps out.' },
  { start_ms: 4_000, speaker: 'Kutter (Sam)', text: 'I ask Brenna whether Gorval came back.' },
  { start_ms: 9_500, speaker: 'DM', text: '"Gorval never returned," she says. "He was with Sable Thorne."' },
];

const known = (): KnownIds => ({
  pc: new Set(['pc-kutter']),
  npc: new Set(['npc-brenna', 'npc-gorval']),
  location: new Set(['loc-docks']),
  faction: new Set(['fac-hand']),
  lore: new Set(),
  hook: new Set(['hook-gorval']),
});

const run = (items: unknown[]) =>
  itemsToProposals(items, { sessionId: 's1', lines, known: known(), pcNames: new Map([['pc-kutter', 'Kutter']]) });

describe('formatTranscript', () => {
  it('numbers lines from 1 with a clock and speaker', () => {
    expect(formatTranscript(lines).split('\n')[1]).toBe('[2] 0:00:04 Kutter (Sam): I ask Brenna whether Gorval came back.');
  });
});

describe('itemsToProposals', () => {
  it('takes the quote, time and speaker from the cited transcript line', () => {
    const [p] = run([{ kind: 'npc', matched_id: 'npc-brenna', name: 'Brenna Coldwater', interaction: 'Told the party Gorval never returned.', source_line: 3, confidence: 0.9 }]);
    expect(p).toMatchObject({ group_key: 'npcs', source_ms: 9_500, source_speaker: 'DM', source_quote: lines[2].text });
  });

  it('leaves the source empty when the cited line doesn’t exist', () => {
    const [p] = run([{ kind: 'summary', text: 'They met Brenna.', source_line: 99 }]);
    expect(p).toMatchObject({ source_ms: null, source_quote: null, source_speaker: null });
  });

  it('updates an existing NPC: new details append, disposition is set, blanks are dropped', () => {
    const [p] = run([{ kind: 'npc', matched_id: 'npc-brenna', name: 'Brenna', description: 'Owes the harbormaster money.', disposition: 'Wary', status: null, role: 'ignored for existing', interaction: 'Spoke with Kutter.', source_line: 1 }]);
    const a = p.action as EntityChange;
    expect(a).toMatchObject({ kind: 'entity', entity_type: 'npc', matched_id: 'npc-brenna', entry: 'Spoke with Kutter.' });
    expect(a.set).toEqual({ disposition: 'Wary', met_by_pcs: true });
    expect(a.append).toEqual({ description: 'Owes the harbormaster money.' });
  });

  it('treats an id the campaign doesn’t have as a new entry', () => {
    const [p] = run([{ kind: 'npc', matched_id: 'made-up-id', name: 'Tamsin', role: 'Ferryman', description: 'Takes stories as fare.', interaction: 'Rowed the party across.', source_line: 2 }]);
    const a = p.action as EntityChange;
    expect(a.matched_id).toBeNull();
    expect(a.set).toMatchObject({ name: 'Tamsin', role: 'Ferryman', description: 'Takes stories as fare.', status: 'active', met_by_pcs: true });
    expect(a.append).toEqual({});
  });

  it('drops PC items for characters not in the campaign, and names the ones that are', () => {
    const out = run([
      { kind: 'pc', pc_id: 'pc-kutter', did: 'Pressed Brenna for answers.', source_line: 2 },
      { kind: 'pc', pc_id: 'pc-nobody', did: 'Something.', source_line: 2 },
    ]);
    expect(out).toHaveLength(1);
    expect((out[0].action as EntityChange).name).toBe('Kutter');
  });

  it('merges several items about the same existing entity into one card', () => {
    const out = run([
      { kind: 'npc', matched_id: 'npc-gorval', name: 'Gorval', interaction: 'Reported missing.', source_line: 2, confidence: 0.9 },
      { kind: 'npc', matched_id: 'npc-gorval', name: 'Gorval', interaction: 'Last seen with Sable Thorne.', status: 'unknown', source_line: 3, confidence: 0.6 },
    ]);
    expect(out).toHaveLength(1);
    const a = out[0].action as EntityChange;
    expect(a.entry).toBe('Reported missing. Last seen with Sable Thorne.');
    expect(a.set.status).toBe('unknown');
    expect(a.confidence).toBe(0.6);
  });

  it('maps thread state changes and keeps is_active in step', () => {
    const [p] = run([{ kind: 'thread', matched_id: 'hook-gorval', title: 'Where is Gorval?', new_state: 'resolved', development: 'Found him.', source_line: 3 }]);
    expect((p.action as EntityChange).set).toEqual({ state: 'resolved', is_active: false });
    const [n] = run([{ kind: 'thread', matched_id: null, title: 'The sealed letter', category: 'not-a-category', development: 'Sable handed it over.', source_line: 3 }]);
    expect((n.action as EntityChange).set).toEqual({ title: 'The sealed letter', description: 'Sable handed it over.', state: 'seed', is_active: true });
  });

  it('turns session items into session field changes, loot in its own group', () => {
    const out = run([
      { kind: 'loot', text: '- 40 gp to Kutter', source_line: 2 },
      { kind: 'summary', text: 'The party reached the docks.', source_line: 1 },
      { kind: 'left_open', text: '- Who sealed the letter?' },
      { kind: 'combats', text: '   ' },
    ]);
    expect(out.map(p => [p.group_key, (p.action as SessionFieldChange).field])).toEqual([
      ['session', 'summary'], ['session', 'hooks_notes'], ['loot', 'loot_rewards'],
    ]);
    expect(out.map(p => p.sort_order)).toEqual([0, 1, 2]);
    expect((out[0].action as SessionFieldChange).session_id).toBe('s1');
  });

  it('orders by group, then by when it happened', () => {
    const out = run([
      { kind: 'location', matched_id: 'loc-docks', name: 'The Docks', happened: 'Arrived.', source_line: 1 },
      { kind: 'npc', matched_id: null, name: 'Sable Thorne', interaction: 'Named as Gorval’s companion.', source_line: 3 },
      { kind: 'npc', matched_id: 'npc-brenna', name: 'Brenna', interaction: 'Met at the docks.', source_line: 1 },
      { kind: 'pc', pc_id: 'pc-kutter', did: 'Asked questions.', source_line: 2 },
    ]);
    expect(out.map(p => (p.action as EntityChange).name)).toEqual(['Kutter', 'Brenna', 'Sable Thorne', 'The Docks']);
  });

  it('ignores junk items and entity items with nothing to say', () => {
    expect(run([null, 'text', { kind: 'unknown' }, { kind: 'faction', matched_id: 'fac-hand', name: 'The Grey Hand', learned: '' }])).toEqual([]);
  });
});

describe('normalizeConfidence', () => {
  it('accepts fractions and percentages, defaults junk to 0.7', () => {
    expect(normalizeConfidence(0.9)).toBe(0.9);
    expect(normalizeConfidence(85)).toBe(0.85);
    expect(normalizeConfidence('nope')).toBe(0.7);
    expect(normalizeConfidence(null)).toBe(0.7);
  });
});

describe('itemsToProposals — current values', () => {
  it('drops changes to the value an entity already has, and the card if nothing is left', () => {
    const current = new Map<string, Record<string, unknown>>([
      ['hook-gorval', { state: 'active', is_active: true }],
      ['npc-brenna', { status: 'active', disposition: 'Wary', met_by_pcs: true }],
    ]);
    const out = itemsToProposals([
      { kind: 'thread', matched_id: 'hook-gorval', title: 'Where is Gorval?', new_state: 'active', development: '', source_line: 1 },
      { kind: 'npc', matched_id: 'npc-brenna', name: 'Brenna', disposition: 'Friendly', interaction: 'Helped.', source_line: 1 },
    ], { sessionId: 's1', lines, known: known(), pcNames: new Map(), current });
    expect(out).toHaveLength(1);
    expect((out[0].action as EntityChange).set).toEqual({ disposition: 'Friendly' });
  });
});
