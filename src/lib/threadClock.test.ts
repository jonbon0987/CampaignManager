import { describe, it, expect } from 'vitest';
import { clockDots, clockFullNote, clockOf, stateAfterClock } from './threadClock';

describe('thread clocks', () => {
  it('has no clock without a size', () => {
    expect(clockOf({ clock_size: null, clock_filled: 3 })).toBeNull();
    expect(clockOf({})).toBeNull();
  });

  it('keeps the fill within the clock, and knows when it is full', () => {
    expect(clockOf({ clock_size: 4, clock_filled: 6, clock_label: '  ' })).toEqual({ size: 4, filled: 4, label: null, full: true });
    expect(clockOf({ clock_size: 6, clock_filled: 2, clock_label: 'The crown rises' })).toEqual({ size: 6, filled: 2, label: 'The crown rises', full: false });
  });

  it('draws filled and empty segments differently', () => {
    expect(clockDots({ size: 6, filled: 3 })).toBe('●●●○○○');
  });

  it('wakes a seed or cold thread when full, and leaves the rest', () => {
    expect(stateAfterClock('seed', 4, 4)).toBe('active');
    expect(stateAfterClock('cold', 4, 4)).toBe('active');
    expect(stateAfterClock('seed', 4, 3)).toBe('seed');
    expect(stateAfterClock('active', 4, 4)).toBe('active');
    expect(stateAfterClock('resolved', 4, 4)).toBe('resolved');
  });

  it('says what filled, and whether the thread woke', () => {
    expect(clockFullNote('The Sunken Crown', 'The crown rises', true)).toBe('“The crown rises” is full, so The Sunken Crown is now Active.');
    expect(clockFullNote('The Sunken Crown', null, false)).toBe('The clock on The Sunken Crown is full.');
  });
});
