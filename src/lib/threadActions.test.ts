import { describe, it, expect } from 'vitest';
import { cleanThreadPayload, threadCardRows, type ThreadCardNames } from './threadActions';

const known = { npcs: ['n1', 'n2'], locations: ['l1'], factions: ['f1'], modules: ['m1'] };
const thread = { id: 't1', title: 'The Tide', state: 'cold', is_active: true, clock_size: 6, clock_filled: 2, clock_label: 'It rises', npc_ids: ['n1'], location_ids: [], faction_ids: [], module_id: null };

describe('cleanThreadPayload: links', () => {
  it('keeps real ids and drops invented or repeated ones', () => {
    const out = cleanThreadPayload({ npc_ids: ['n1', 'made-up', 'n2', 'n1'], location_ids: ['nope'], faction_ids: 'f1' }, null, known);
    expect(out.npc_ids).toEqual(['n1', 'n2']);
    expect(out.location_ids).toEqual([]);
    expect(out.faction_ids).toEqual([]);
  });

  it('leaves links alone when it isn’t given any', () => {
    expect(cleanThreadPayload({ title: 'x' }, thread, known)).toEqual({ title: 'x' });
  });

  it('won’t point a thread at a chapter that doesn’t exist, which the database would refuse', () => {
    expect(cleanThreadPayload({ module_id: 'nope' }, null, known)).not.toHaveProperty('module_id');
    expect(cleanThreadPayload({ module_id: 'nope' }, { ...thread, module_id: 'm1' }, known).module_id).toBe('m1');
    expect(cleanThreadPayload({ module_id: 'm1' }, null, known).module_id).toBe('m1');
    expect(cleanThreadPayload({ module_id: null }, { ...thread, module_id: 'm1' }, known).module_id).toBeNull();
  });
});

describe('cleanThreadPayload: clocks', () => {
  it('takes a size from the three there are, written as a number or text', () => {
    expect(cleanThreadPayload({ clock_size: 8 }, null, known).clock_size).toBe(8);
    expect(cleanThreadPayload({ clock_size: '4' }, null, known).clock_size).toBe(4);
  });

  it('refuses any other size, keeping what’s there', () => {
    expect(cleanThreadPayload({ clock_size: 5 }, thread, known).clock_size).toBe(6);
    expect(cleanThreadPayload({ clock_size: 5, clock_label: 'x' }, null, known)).toEqual({ clock_filled: 0, clock_label: null });
  });

  it('holds the count inside the clock', () => {
    expect(cleanThreadPayload({ clock_filled: 99 }, thread, known).clock_filled).toBe(6);
    expect(cleanThreadPayload({ clock_filled: -3 }, thread, known).clock_filled).toBe(0);
    expect(cleanThreadPayload({ clock_size: 4, clock_filled: 7 }, null, known).clock_filled).toBe(4);
    expect(cleanThreadPayload({ clock_size: 4 }, { ...thread, clock_filled: 6, clock_size: 6 }, known).clock_filled).toBe(4);
  });

  it('clears the count and label with the clock', () => {
    const out = cleanThreadPayload({ clock_size: null }, thread, known);
    expect(out).toEqual({ clock_size: null, clock_filled: 0, clock_label: null });
  });

  it('wakes a cold thread when the clock fills, as filling it by hand does', () => {
    const out = cleanThreadPayload({ clock_filled: 6 }, thread, known);
    expect(out.state).toBe('active');
    expect(out.is_active).toBe(true);
  });

  it('leaves the state alone short of full, on an active thread, or if it was already full', () => {
    expect(cleanThreadPayload({ clock_filled: 5 }, thread, known)).not.toHaveProperty('state');
    expect(cleanThreadPayload({ clock_filled: 6 }, { ...thread, state: 'active' }, known)).not.toHaveProperty('state');
    expect(cleanThreadPayload({ title: 'x' }, { ...thread, clock_filled: 6 }, known)).not.toHaveProperty('state');
  });
});

describe('threadCardRows', () => {
  const lookup = (m: Record<string, string>) => (id: string) => m[id];
  const names: ThreadCardNames = {
    npc: lookup({ n1: 'Sable', n2: 'Brenna' }), place: lookup({ l1: 'The Wharf' }),
    faction: lookup({ f1: 'The Grey Hand' }), module: lookup({ m1: 'The Sunken Crown' }),
  };

  it('shows a clock’s change in words', () => {
    expect(threadCardRows(thread, { clock_filled: 3 }, names)).toEqual([{ label: 'Clock', old: '2 of 6: It rises', value: '3 of 6: It rises' }]);
  });

  it('shows a new clock, and a removed one', () => {
    expect(threadCardRows(null, { clock_size: 4, clock_filled: 0, clock_label: 'Boom' }, names)).toEqual([{ label: 'Clock', old: undefined, value: '0 of 4: Boom' }]);
    expect(threadCardRows(thread, { clock_size: null, clock_filled: 0, clock_label: null }, names)).toEqual([{ label: 'Clock', old: '2 of 6: It rises', value: '—' }]);
  });

  it('names links rather than showing ids', () => {
    const rows = threadCardRows(thread, { npc_ids: ['n1', 'n2'], location_ids: ['l1'], faction_ids: ['f1'], module_id: 'm1' }, names);
    expect(rows).toEqual([
      { label: 'People', old: 'Sable', value: 'Sable, Brenna' },
      { label: 'Places', old: undefined, value: 'The Wharf' },
      { label: 'Factions', old: undefined, value: 'The Grey Hand' },
      { label: 'Chapter', old: undefined, value: 'The Sunken Crown' },
    ]);
  });

  it('adds no rows when nothing about them changes', () => {
    expect(threadCardRows(thread, { title: 'New', npc_ids: ['n1'], clock_filled: 2 }, names)).toEqual([]);
  });
});
