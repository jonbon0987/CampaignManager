import { describe, it, expect } from 'vitest';
import { parseCombatants } from './encounters';

describe('parseCombatants', () => {
  it('reads the stored creature list', () => {
    const raw = JSON.stringify([{ statblock_id: 'sb1', count: 2, notes: '' }]);
    expect(parseCombatants(raw)).toEqual([{ statblock_id: 'sb1', count: 2, notes: '' }]);
  });
  it('gives none for empty or broken JSON', () => {
    expect(parseCombatants(null)).toEqual([]);
    expect(parseCombatants('')).toEqual([]);
    expect(parseCombatants('{nope')).toEqual([]);
  });
});
