import { describe, it, expect } from 'vitest';
import { plural } from './plural';
import { firstNamed } from './firstNamed';

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'event')).toBe('1 event');
    expect(plural(0, 'event')).toBe('0 events');
    expect(plural(3, 'chapter')).toBe('3 chapters');
  });

  it('takes an irregular plural', () => {
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
    expect(plural(1, 'entry', 'entries')).toBe('1 entry');
  });
});

describe('firstNamed', () => {
  const rows = [{ id: 'a', name: '' }, { id: 'b', name: '  ' }, { id: 'c', name: 'Brenna' }];

  it('skips blank records', () => {
    expect(firstNamed(rows, r => r.name)?.id).toBe('c');
  });

  it('falls back to the first when nothing has a name', () => {
    expect(firstNamed(rows.slice(0, 2), r => r.name)?.id).toBe('a');
    expect(firstNamed([], (r: { name: string }) => r.name)).toBeUndefined();
  });
});
