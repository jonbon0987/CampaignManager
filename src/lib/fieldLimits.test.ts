import { describe, it, expect } from 'vitest';
import {
  LIMIT,
  validateFieldLimits,
  FieldLimitError,
  limitFor,
  rangeFor,
  fieldLabel,
} from './fieldLimits';

describe('validateFieldLimits — text', () => {
  it('passes when a value is within its limit', () => {
    expect(() => validateFieldLimits('npcs', { name: 'Kutter' })).not.toThrow();
  });

  it('passes on the exact boundary length', () => {
    expect(() =>
      validateFieldLimits('npcs', { name: 'x'.repeat(LIMIT.NAME) }),
    ).not.toThrow();
  });

  it('throws FieldLimitError one character over the limit', () => {
    expect(() =>
      validateFieldLimits('npcs', { name: 'x'.repeat(LIMIT.NAME + 1) }),
    ).toThrow(FieldLimitError);
  });

  it('reports the offending column and a user-facing message', () => {
    try {
      validateFieldLimits('factions', { agenda: 'x'.repeat(LIMIT.PROSE + 1) });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FieldLimitError);
      const e = err as FieldLimitError;
      expect(e.table).toBe('factions');
      expect(e.column).toBe('agenda');
      expect(e.message).toMatch(/Agenda is too long/);
      expect(e.message).toContain((LIMIT.PROSE + 1).toLocaleString());
    }
  });

  it('ignores null / non-string values (nullable columns)', () => {
    expect(() =>
      validateFieldLimits('npcs', { name: 'ok', description: null, first_session: null }),
    ).not.toThrow();
  });

  it('ignores columns that have no configured limit', () => {
    expect(() =>
      validateFieldLimits('npcs', { id: 'x'.repeat(10_000) }),
    ).not.toThrow();
  });

  it('is a no-op for unknown tables', () => {
    expect(() =>
      validateFieldLimits('not_a_table', { whatever: 'x'.repeat(100_000) }),
    ).not.toThrow();
  });
});

describe('validateFieldLimits — numeric ranges', () => {
  it('passes within range and on the boundaries', () => {
    expect(() => validateFieldLimits('monster_statblocks', { str: 1 })).not.toThrow();
    expect(() => validateFieldLimits('monster_statblocks', { str: 99 })).not.toThrow();
  });

  it('throws below the minimum', () => {
    expect(() => validateFieldLimits('monster_statblocks', { str: 0 })).toThrow(FieldLimitError);
  });

  it('throws above the maximum', () => {
    expect(() => validateFieldLimits('worlds', { year: 100_000 })).toThrow(FieldLimitError);
  });

  it('allows negative years within range', () => {
    expect(() => validateFieldLimits('worlds', { year: -5000 })).not.toThrow();
  });
});

describe('lookup helpers', () => {
  it('limitFor returns the configured limit or undefined', () => {
    expect(limitFor('npcs', 'name')).toBe(LIMIT.NAME);
    expect(limitFor('npcs', 'nope')).toBeUndefined();
  });

  it('rangeFor returns the configured range or undefined', () => {
    expect(rangeFor('monster_statblocks', 'armor_class')).toEqual([0, 99]);
    expect(rangeFor('monster_statblocks', 'name')).toBeUndefined();
  });

  it('fieldLabel humanizes column names', () => {
    expect(fieldLabel('dm_notes')).toBe('DM notes');
    expect(fieldLabel('dm_only_notes')).toBe('DM notes');
    expect(fieldLabel('hooks_motivations')).toBe('Hooks motivations');
    expect(fieldLabel('name')).toBe('Name');
  });
});
