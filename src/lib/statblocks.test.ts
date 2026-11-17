import { describe, it, expect } from 'vitest';
import { abilityModLabel, CHALLENGE_RATINGS, emptyMonsterForm } from './statblocks';

describe('stat-sheet helpers', () => {
  it('labels ability modifiers with a sign', () => {
    expect(abilityModLabel(10)).toBe('+0');
    expect(abilityModLabel(15)).toBe('+2');
    expect(abilityModLabel(8)).toBe('-1');
  });
  it('lists every challenge rating once, fractions first', () => {
    expect(CHALLENGE_RATINGS.slice(0, 4)).toEqual(['0', '1/8', '1/4', '1/2']);
    expect(CHALLENGE_RATINGS.at(-1)).toBe('30');
    expect(new Set(CHALLENGE_RATINGS).size).toBe(CHALLENGE_RATINGS.length);
  });
  it('starts a new sheet blank, as a monstrosity', () => {
    const f = emptyMonsterForm();
    expect(f.creature_type).toBe('monstrosity');
    expect(f.name).toBe('');
  });
});
