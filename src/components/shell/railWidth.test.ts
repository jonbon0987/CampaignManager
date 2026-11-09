import { describe, it, expect } from 'vitest';
import { RAIL_DEFAULT, RAIL_MIN, clampRail, railMax } from './railWidth';

describe('rail width', () => {
  it('keeps a width it can take', () => {
    expect(clampRail(420, 1440)).toBe(420);
    expect(clampRail(420.6, 1440)).toBe(421);
  });

  it('never goes narrower than the assistant needs', () => {
    expect(clampRail(120, 1440)).toBe(RAIL_MIN);
  });

  it('leaves the page beside it room, and stops at a sensible width on a wide screen', () => {
    expect(railMax(1024)).toBe(RAIL_MIN);
    expect(railMax(1440)).toBe(540);
    expect(railMax(2560)).toBe(760);
    expect(clampRail(900, 1440)).toBe(540);
  });

  it('falls back to the usual width for anything unreadable', () => {
    expect(clampRail('wide', 1440)).toBe(RAIL_DEFAULT);
    expect(clampRail(NaN, 1440)).toBe(RAIL_DEFAULT);
    expect(clampRail(null, 1440)).toBe(RAIL_DEFAULT);
  });
});
