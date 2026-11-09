import { describe, it, expect } from 'vitest';
import {
  applyRule, campaignCardRows, cleanCampaignPayload, cleanParent, cleanSessionPayload, cleanTreasuryPayload,
  holderChanges, holdersOf, holdersText, itemCardRows, parseWorldDate, ruleTopic, sessionCardRows, sessionTime,
  treasuryName,
} from './assistantCampaign';
import { PRESETS } from './calendar';
import type { ItemHolding } from './database.types';
import type { HouseRule } from './houseRules';

const harptos = PRESETS.find(p => p.id === 'harptos')!.months;
const twelve = PRESETS[0].months;
const known = { pcs: ['pc-1', 'pc-2'], sessions: ['s-1'] };
const pcs = [{ id: 'pc-1', character_name: 'Kael' }, { id: 'pc-2', character_name: 'Mira' }];

const holding = (over: Partial<ItemHolding>): ItemHolding => ({
  id: 'h-1', user_id: 'u', campaign_id: 'c', item_id: 'i-1', pc_id: null, quantity: 1, attuned: false,
  session_id: null, note: null, created_at: '', updated_at: '', ...over,
});

describe('holdersOf', () => {
  it('keeps real PCs and the party, and drops made-up ids', () => {
    expect(holdersOf([{ pc_id: 'pc-1', attuned: true }, { pc_id: null, quantity: 3 }, { pc_id: 'ghost' }], known)).toEqual([
      { pc_id: 'pc-1', quantity: 1, attuned: true, session_id: null },
      { pc_id: null, quantity: 3, attuned: false, session_id: null },
    ]);
  });

  it('reads "party" and bare ids, and folds repeats into one holder', () => {
    expect(holdersOf(['pc-2', 'party', { pc_id: 'pc-2', quantity: '2' }], known)).toEqual([
      { pc_id: 'pc-2', quantity: 3, attuned: false, session_id: null },
      { pc_id: null, quantity: 1, attuned: false, session_id: null },
    ]);
  });

  it('keeps a quantity inside what the database allows', () => {
    expect(holdersOf([{ pc_id: 'pc-1', quantity: 0 }, { pc_id: 'pc-2', quantity: 1e9 }], known).map(h => h.quantity)).toEqual([1, 9999]);
  });

  it('is nobody for an empty list or anything that isn’t a list', () => {
    expect(holdersOf([], known)).toEqual([]);
    expect(holdersOf(null, known)).toEqual([]);
  });
});

describe('holderChanges', () => {
  it('hands an item from one PC to another', () => {
    const kael = holding({ id: 'h-1', pc_id: 'pc-1' });
    const out = holderChanges([kael], [{ pc_id: 'pc-2', quantity: 1, attuned: false }]);
    expect(out.remove).toEqual([kael]);
    expect(out.give).toEqual([{ pc_id: 'pc-2', quantity: 1, attuned: false }]);
    expect(out.update).toEqual([]);
  });

  it('changes a holder in place and keeps a note it wasn’t told about', () => {
    const kael = holding({ pc_id: 'pc-1', quantity: 2, note: 'from the vault' });
    const out = holderChanges([kael], [{ pc_id: 'pc-1', quantity: 1, attuned: true }]);
    expect(out.update).toEqual([{ holding: kael, patch: { quantity: 1, attuned: true } }]);
    expect(out.give).toEqual([]);
    expect(out.remove).toEqual([]);
  });

  it('takes it from everyone for an empty list', () => {
    const both = [holding({ id: 'a', pc_id: 'pc-1' }), holding({ id: 'b', pc_id: null })];
    expect(holderChanges(both, []).remove).toEqual(both);
  });
});

describe('item cards', () => {
  it('names holders, and the party once there are others', () => {
    expect(holdersText([{ pc_id: 'pc-1', quantity: 1, attuned: true }, { pc_id: null, quantity: 2, attuned: false }], pcs))
      .toBe('Kael (attuned), the party ×2');
  });

  it('shows what kind of item it is and who will hold it', () => {
    const rows = itemCardRows(null, { name: 'Cloak', item_type: 'wondrous', rarity: 'uncommon', attunement: true, holders: [{ pc_id: 'pc-2' }] }, [], { pcs, sessions: [] });
    expect(rows).toEqual([
      { label: 'Kind', old: undefined, value: 'Uncommon wondrous item, requires attunement' },
      { label: 'Held by', old: undefined, value: 'Mira' },
    ]);
  });

  it('says nobody will have it when the holders are cleared', () => {
    const rows = itemCardRows({ id: 'i-1', name: 'Cloak' }, { holders: [] }, [holding({ pc_id: 'pc-1' })], { pcs, sessions: [] });
    expect(rows).toEqual([{ label: 'Held by', old: 'Kael', value: 'Nobody' }]);
  });
});

describe('cleanTreasuryPayload', () => {
  it('reads whole coins, signed, and keeps only a real PC and session', () => {
    expect(cleanTreasuryPayload({ gp: '-40', sp: 5.7, note: ' Bribe ', pc_id: 'pc-1', session_id: 'made-up' }, known)).toEqual({
      pp: 0, gp: -40, ep: 0, sp: 5, cp: 0, note: 'Bribe', pc_id: 'pc-1', session_id: null,
    });
  });

  it('names a line by its coin and note', () => {
    expect(treasuryName({ gp: 250, note: 'Loot from the vault' })).toBe('+250 gp · Loot from the vault');
    expect(treasuryName({ gp: -40 })).toBe('−40 gp');
  });
});

describe('house rules', () => {
  const rules: HouseRule[] = [{ id: 'r-1', topic: 'Combat', title: 'Flanking', text: 'Advantage when flanking.' }];

  it('reads a topic loosely', () => {
    expect(ruleTopic('rest')).toBe('Rest and healing');
    expect(ruleTopic('COMBAT')).toBe('Combat');
    expect(ruleTopic('character creation')).toBe('Characters');
    expect(ruleTopic('whatever')).toBe('Table');
  });

  it('adds a new rule with a fresh id', () => {
    const next = applyRule(rules, { topic: 'Table', title: 'No PvP', text: 'Ask first.' }, () => 'r-2');
    expect(next).toEqual([...rules, { id: 'r-2', topic: 'Table', title: 'No PvP', text: 'Ask first.' }]);
  });

  it('changes only the fields sent on a rule that’s there', () => {
    expect(applyRule(rules, { id: 'r-1', text: 'Only for melee.' }, () => 'x'))
      .toEqual([{ id: 'r-1', topic: 'Combat', title: 'Flanking', text: 'Only for melee.' }]);
  });

  it('refuses a rule with nothing in it', () => {
    expect(() => applyRule(rules, { title: ' ' }, () => 'x')).toThrow(/no title or text/);
  });
});

describe('campaign settings', () => {
  it('reads dates in the world’s calendar', () => {
    expect(parseWorldDate('14 Mirtul 1492 DR', harptos)).toEqual({ year: 1492, day: 136 });
    expect(parseWorldDate('Mirtul 14, 1492', harptos)).toEqual({ year: 1492, day: 136 });
    expect(parseWorldDate('Midwinter 1492', harptos)).toEqual({ year: 1492, day: 31 });
    expect(parseWorldDate('5 Month 12 3', twelve)).toEqual({ year: 3, day: 335 });
    expect(parseWorldDate({ year: 1492, day: 10 }, harptos)).toEqual({ year: 1492, day: 10 });
    expect(parseWorldDate('next Tuesday', harptos)).toBeNull();
  });

  it('reads settings loosely and leaves out what it can’t read', () => {
    expect(cleanCampaignPayload({ rules_edition: '2024 rules', levelling: 'Milestone', session_repeat: 'every other week', world_date: '1 Hammer 1493' }, harptos))
      .toEqual({ rules_edition: '2024', levelling: 'milestone', session_repeat: 'fortnightly', world_date: { year: 1493, day: 1 } });
    expect(cleanCampaignPayload({ session_repeat: null, levelling: 'vibes', world_date: 'soon' }, harptos)).toEqual({ session_repeat: null });
  });

  it('shows the change in words on the card', () => {
    const rows = campaignCardRows(
      { rules_edition: null, session_repeat: 'weekly', world_date: { year: 1492, day: 136 } },
      { rules_edition: '2024', session_repeat: 'weekly', world_date: { year: 1492, day: 139 } },
      { months: harptos, suffix: 'DR' },
    );
    expect(rows).toEqual([
      { label: 'Rules', old: '2014 rules', value: '2024 rules' },
      { label: 'In-world date', old: '14 Mirtul 1492 DR', value: '17 Mirtul 1492 DR' },
    ]);
  });
});

describe('sessions', () => {
  it('reads a start time', () => {
    expect(sessionTime('19:00')).toBe('19:00');
    expect(sessionTime('7pm')).toBe('19:00');
    expect(sessionTime('7:30 PM')).toBe('19:30');
    expect(sessionTime('12am')).toBe('00:00');
    expect(sessionTime('none')).toBeNull();
    expect(sessionTime('after dinner')).toBeUndefined();
  });

  it('merges a plan onto what’s planned, keeping real ids and the checklist', () => {
    const existing = { plan: { hook_ids: ['t-1'], npc_ids: ['n-1'], checklist: { recap: true } } };
    const out = cleanSessionPayload({ plan: { hook_ids: ['t-1', 't-2', 'ghost'] }, session_time: '8pm' }, existing,
      { threads: ['t-1', 't-2'], npcs: ['n-1'], scenes: [] });
    expect(out).toEqual({ plan: { hook_ids: ['t-1', 't-2'], npc_ids: ['n-1'], checklist: { recap: true } }, session_time: '20:00' });
  });

  it('drops a time or plan it can’t read', () => {
    expect(cleanSessionPayload({ session_time: 'later', plan: 'everything' }, null, { threads: [], npcs: [], scenes: [] })).toEqual({});
  });

  it('names the plan on the card', () => {
    const rows = sessionCardRows({ plan: { hook_ids: ['t-1'] } }, { plan: { hook_ids: ['t-1', 't-2'] } }, {
      thread: id => ({ 't-1': 'The Tide', 't-2': 'The Debt' })[id], npc: () => undefined, scene: () => undefined,
    });
    expect(rows).toEqual([{ label: 'Threads to bring in', old: 'The Tide', value: 'The Tide, The Debt' }]);
  });
});

describe('cleanParent', () => {
  const places = [
    { id: 'region', parent_id: null },
    { id: 'city', parent_id: 'region' },
    { id: 'inn', parent_id: 'city' },
  ];

  it('keeps a real parent and clears one set to null', () => {
    expect(cleanParent({ id: 'inn', parent_id: 'region' }, places).parent_id).toBe('region');
    expect(cleanParent({ id: 'inn', parent_id: null }, places).parent_id).toBeNull();
  });

  it('refuses a made-up place, the place itself, or one of its own children', () => {
    expect(cleanParent({ id: 'inn', parent_id: 'ghost' }, places)).not.toHaveProperty('parent_id');
    expect(cleanParent({ id: 'city', parent_id: 'city' }, places)).not.toHaveProperty('parent_id');
    expect(cleanParent({ id: 'region', parent_id: 'inn' }, places)).not.toHaveProperty('parent_id');
  });

  it('lets a new place sit anywhere real', () => {
    expect(cleanParent({ name: 'Cellar', parent_id: 'inn' }, places).parent_id).toBe('inn');
  });
});
