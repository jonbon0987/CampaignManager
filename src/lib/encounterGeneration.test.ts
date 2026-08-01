import { describe, it, expect } from 'vitest';
import {
  toIntOrNull,
  creatureToInsert,
  resolveCombatants,
  pickDifficulty,
  type ResolvableCreature,
} from './encounterGeneration';

const lib: ResolvableCreature[] = [
  { id: 'lib-goblin', name: 'Goblin', creature_type: 'humanoid', challenge_rating: '1/4' },
  { id: 'lib-wolf', name: 'Dire Wolf', creature_type: 'beast', challenge_rating: '1' },
];

describe('toIntOrNull', () => {
  it('parses ints and rejects junk', () => {
    expect(toIntOrNull('3')).toBe(3);
    expect(toIntOrNull(5)).toBe(5);
    expect(toIntOrNull('  12 ')).toBe(12);
    expect(toIntOrNull('abc')).toBeNull();
    expect(toIntOrNull(null)).toBeNull();
    expect(toIntOrNull(undefined)).toBeNull();
    expect(toIntOrNull('')).toBeNull();
  });
});

describe('resolveCombatants', () => {
  it('links a combatant to a newly-created creature (new takes precedence)', () => {
    const savedNew: ResolvableCreature[] = [
      { id: 'new-fiend', name: 'Ash Fiend', creature_type: 'fiend', challenge_rating: '5' },
    ];
    const [c] = resolveCombatants([{ name: 'Ash Fiend', count: 2 }], savedNew, lib);
    expect(c.source).toBe('saved');
    expect(c.statblock_id).toBe('new-fiend');
    expect(c.creature_type).toBe('fiend');
    expect(c.challenge_rating).toBe('5');
    expect(c.count).toBe(2);
  });

  it('links to an existing library creature by case-insensitive name', () => {
    const [c] = resolveCombatants([{ name: '  goblin ', count: 4 }], [], lib);
    expect(c.source).toBe('saved');
    expect(c.statblock_id).toBe('lib-goblin');
    expect(c.name).toBe('Goblin'); // canonical name from the library, not the raw input
    expect(c.count).toBe(4);
  });

  it('prefers a newly-created creature over a same-named library entry', () => {
    const savedNew: ResolvableCreature[] = [
      { id: 'new-goblin', name: 'Goblin', creature_type: 'humanoid', challenge_rating: '1/2' },
    ];
    const [c] = resolveCombatants([{ name: 'Goblin' }], savedNew, lib);
    expect(c.statblock_id).toBe('new-goblin');
    expect(c.challenge_rating).toBe('1/2');
  });

  it('falls back to a custom combatant when nothing matches', () => {
    const [c] = resolveCombatants([{ name: 'Mystery Beast', notes: 'lurks in shadow' }], [], lib);
    expect(c.source).toBe('custom');
    expect(c.statblock_id).toBeNull();
    expect(c.name).toBe('Mystery Beast');
    expect(c.creature_type).toBeNull();
    expect(c.notes).toBe('lurks in shadow');
  });

  it('clamps count to a minimum of 1 and defaults missing/invalid counts', () => {
    const rows = [
      { name: 'Goblin', count: 0 },
      { name: 'Dire Wolf', count: -3 },
      { name: 'Goblin', count: 'not-a-number' },
      { name: 'Dire Wolf' },
    ];
    const out = resolveCombatants(rows, [], lib);
    expect(out.map(c => c.count)).toEqual([1, 1, 1, 1]);
  });

  it('normalizes empty/whitespace notes to null', () => {
    const [c] = resolveCombatants([{ name: 'Goblin', notes: '   ' }], [], lib);
    expect(c.notes).toBeNull();
  });

  it('drops entries with no usable name and tolerates a non-array input', () => {
    expect(resolveCombatants([{ count: 3 }, { name: '   ' }], [], lib)).toEqual([]);
    expect(resolveCombatants(null, [], lib)).toEqual([]);
    expect(resolveCombatants(undefined, [], lib)).toEqual([]);
  });

  it('assigns a unique id to every combatant', () => {
    const out = resolveCombatants([{ name: 'Goblin' }, { name: 'Goblin' }], [], lib);
    expect(out).toHaveLength(2);
    expect(out[0].id).not.toBe(out[1].id);
    expect(typeof out[0].id).toBe('string');
  });
});

describe('creatureToInsert', () => {
  it('coerces AI field types and carries sort order', () => {
    const insert = creatureToInsert(
      {
        name: 'Bog Lurker',
        creature_type: 'monstrosity',
        challenge_rating: 3,          // number → string
        armor_class: '14',            // string → int
        hit_points: 52,
        str: '16',
        dex: 12,
        cha: null,                    // null → null
        content: 'Multiattack. The lurker makes two claw attacks.',
      },
      7,
    );
    expect(insert.name).toBe('Bog Lurker');
    expect(insert.challenge_rating).toBe('3');
    expect(insert.armor_class).toBe(14);
    expect(insert.hit_points).toBe(52);
    expect(insert.str).toBe(16);
    expect(insert.dex).toBe(12);
    expect(insert.cha).toBeNull();
    expect(insert.world_id).toBeNull();
    expect(insert.sort_order).toBe(7);
  });

  it('supplies a fallback name and nulls for missing optional fields', () => {
    const insert = creatureToInsert({}, 0);
    expect(insert.name).toBe('Unnamed Creature');
    expect(insert.armor_class).toBeNull();
    expect(insert.senses).toBeNull();
    expect(insert.tags).toBeNull();
  });
});

describe('pickDifficulty', () => {
  const valid = ['easy', 'medium', 'hard', 'deadly'] as const;

  it('keeps a valid difficulty', () => {
    expect(pickDifficulty('deadly', 'medium', valid)).toBe('deadly');
  });

  it('falls back on an unknown, wrong-typed, or missing value', () => {
    expect(pickDifficulty('impossible', 'hard', valid)).toBe('hard');
    expect(pickDifficulty(3, 'medium', valid)).toBe('medium');
    expect(pickDifficulty(undefined, 'easy', valid)).toBe('easy');
  });
});
