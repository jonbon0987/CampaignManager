import { describe, it, expect } from 'vitest';
import {
  RANDOM_TABLE_KINDS,
  DIE_SIZES,
  kindMeta,
  normalizeDie,
  RARITY_WEIGHTS,
  usesRarity,
  parseEntries,
  weightedRanges,
  rollWeighted,
} from './randomEncounter';
import type { RandomEncounterEntry } from './database.types';

const entry = (weight: number, name = 'x'): RandomEncounterEntry => ({
  id: `${name}-${weight}`, name, description: '', weight, rarity: null,
});

describe('kinds', () => {
  it('exposes the five default kinds', () => {
    expect(RANDOM_TABLE_KINDS.map(k => k.key)).toEqual(['encounter', 'treasure', 'magic', 'wild', 'custom']);
  });
  it('kindMeta falls back to encounter for unknown keys', () => {
    expect(kindMeta('nope').key).toBe('encounter');
    expect(kindMeta('wild').label).toBe('Wild Magic');
  });
  it('rarity is used only for magic + encounter', () => {
    expect(usesRarity('magic')).toBe(true);
    expect(usesRarity('encounter')).toBe(true);
    expect(usesRarity('treasure')).toBe(false);
    expect(usesRarity('custom')).toBe(false);
  });
});

describe('parseEntries', () => {
  it('returns [] for null/empty/garbage', () => {
    expect(parseEntries(null)).toEqual([]);
    expect(parseEntries('')).toEqual([]);
    expect(parseEntries('not json')).toEqual([]);
    expect(parseEntries('{"not":"array"}')).toEqual([]);
  });

  it('parses the weighted shape', () => {
    const json = JSON.stringify([{ id: 'a', name: 'Wolves', description: 'howl', weight: 4, rarity: 'uncommon' }]);
    expect(parseEntries(json)).toEqual([
      { id: 'a', name: 'Wolves', description: 'howl', weight: 4, rarity: 'uncommon' },
    ]);
  });

  it('derives weight from rarity when weight is absent', () => {
    const json = JSON.stringify([{ id: 'a', name: 'Relic', rarity: 'rare' }]);
    expect(parseEntries(json)[0].weight).toBe(RARITY_WEIGHTS.rare);
  });

  it('migrates legacy { min, max, result, notes } rows', () => {
    const json = JSON.stringify([{ id: 'a', min: 1, max: 5, result: 'Goblins', notes: 'ambush' }]);
    const [e] = parseEntries(json);
    expect(e.name).toBe('Goblins');
    expect(e.description).toBe('ambush');
    expect(e.weight).toBe(5); // range width 1..5
  });

  it('defaults weight to at least 1', () => {
    expect(parseEntries(JSON.stringify([{ name: 'x' }]))[0].weight).toBe(1);
  });
});

describe('weightedRanges', () => {
  it('tiles 1..100 with no gaps', () => {
    const ranges = weightedRanges([entry(1), entry(1), entry(1), entry(1)]);
    expect(ranges[0].lo).toBe(1);
    expect(ranges[ranges.length - 1].hi).toBe(100);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].lo).toBe(ranges[i - 1].hi + 1);
    }
  });

  it('gives proportional shares', () => {
    const [a, b] = weightedRanges([entry(3), entry(1)]);
    expect(a.pct).toBeCloseTo(0.75);
    expect(b.pct).toBeCloseTo(0.25);
    expect(a.hi).toBe(75);
    expect(b.lo).toBe(76);
  });

  it('handles a single entry covering the whole die', () => {
    const [only] = weightedRanges([entry(8)]);
    expect(only.lo).toBe(1);
    expect(only.hi).toBe(100);
  });
});

describe('die size', () => {
  it('exposes d4..d100 sizes', () => {
    expect(DIE_SIZES).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });
  it('normalizeDie clamps unknown sizes to d100', () => {
    expect(normalizeDie(20)).toBe(20);
    expect(normalizeDie(7)).toBe(100);
    expect(normalizeDie(null)).toBe(100);
  });
  it('weightedRanges tiles to the given die', () => {
    const ranges = weightedRanges([entry(1, 'a'), entry(1, 'b')], 20);
    expect(ranges[0]).toMatchObject({ lo: 1, hi: 10 });
    expect(ranges[1]).toMatchObject({ lo: 11, hi: 20 });
  });
});

describe('rollWeighted', () => {
  const entries = [entry(3, 'low'), entry(1, 'high')]; // d100 → low: 1-75, high: 76-100
  it('resolves the entry whose range contains the roll', () => {
    expect(rollWeighted(entries, 100, () => 0).entry?.name).toBe('low');       // roll 1
    expect(rollWeighted(entries, 100, () => 0.999999).entry?.name).toBe('high'); // roll 100
    expect(rollWeighted(entries, 100, () => 0.5).entry?.name).toBe('low');      // roll 51
  });
  it('respects the die size when rolling', () => {
    // d20, low covers 1-15, high 16-20
    expect(rollWeighted(entries, 20, () => 0).entry?.name).toBe('low');        // roll 1
    expect(rollWeighted(entries, 20, () => 0.999999).entry?.name).toBe('high'); // roll 20
    expect(rollWeighted(entries, 20, () => 0.999999).roll).toBe(20);
  });
  it('returns null entry for an empty table', () => {
    expect(rollWeighted([], 100, () => 0).entry).toBeNull();
  });
  it('always rolls within 1..die', () => {
    for (let i = 0; i < 200; i++) {
      const { roll } = rollWeighted(entries, 12);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(12);
    }
  });
});
