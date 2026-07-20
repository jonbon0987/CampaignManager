import { describe, it, expect } from 'vitest';
import { normalizeConfidence, computeDiffRows, DEFAULT_CONFIDENCE } from './documentImport';

describe('normalizeConfidence', () => {
  it('passes through a valid 0-1 number', () => {
    expect(normalizeConfidence(0.82)).toBe(0.82);
  });
  it('rescales a percentage the model sent as 0-100', () => {
    expect(normalizeConfidence(88)).toBeCloseTo(0.88);
  });
  it('clamps out-of-range values', () => {
    expect(normalizeConfidence(1.4)).toBe(1);
    expect(normalizeConfidence(-3)).toBe(0);
  });
  it('parses a numeric string', () => {
    expect(normalizeConfidence('0.75')).toBe(0.75);
  });
  it('falls back to the default for junk or absent values', () => {
    expect(normalizeConfidence(undefined)).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence('high')).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence(null)).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence(NaN)).toBe(DEFAULT_CONFIDENCE);
  });
});

describe('computeDiffRows', () => {
  it('reports every payload field as new when there is no existing record', () => {
    const rows = computeDiffRows(null, { name: 'Sable', role: 'Rogue' });
    expect(rows).toEqual([
      { key: 'name', oldValue: null, newValue: 'Sable' },
      { key: 'role', oldValue: null, newValue: 'Rogue' },
    ]);
  });
  it('only reports fields that actually changed', () => {
    const existing = { name: 'Sable', role: 'Rogue', status: 'active' };
    const rows = computeDiffRows(existing, { name: 'Sable', role: 'Assassin' });
    expect(rows).toEqual([{ key: 'role', oldValue: 'Rogue', newValue: 'Assassin' }]);
  });
  it('hides foreign-key and internal fields', () => {
    const rows = computeDiffRows(null, { name: 'X', faction_ids: ['a'], id: 'z', campaign_id: 'c' });
    expect(rows.map(r => r.key)).toEqual(['name']);
  });
  it('treats null and empty string as equal (no spurious diff)', () => {
    const rows = computeDiffRows({ note: null }, { note: '' });
    expect(rows).toEqual([]);
  });
});
