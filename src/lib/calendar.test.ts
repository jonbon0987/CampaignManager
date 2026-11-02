import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MONTHS, PRESETS, addDays, compareDates, dateOf, daysBetween, daysInYear, daysLabel,
  formatSpan, formatWorldDate, fromMonthDay, monthsOf, nextMonth, normalize, toMonthDay, yearSuffix,
} from './calendar';

const harptos = PRESETS.find(p => p.id === 'harptos')!.months;
const mirtul = harptos.findIndex(m => m.name === 'Mirtul');

describe('presets', () => {
  it('have the years their calendars have', () => {
    expect(daysInYear(DEFAULT_MONTHS)).toBe(360);
    expect(daysInYear(harptos)).toBe(365);
    expect(daysInYear(PRESETS.find(p => p.id === 'gregorian')!.months)).toBe(365);
  });
});

describe('monthsOf', () => {
  it('reads stored months, tidying names and day counts', () => {
    expect(monthsOf([{ name: ' Ches ', days: 30.4 }, { name: '', days: 0 }, { name: 'Big', days: 9999 }])).toEqual([
      { name: 'Ches', days: 30 }, { name: 'Unnamed month', days: 1 }, { name: 'Big', days: 400 },
    ]);
  });

  it('falls back to the default without usable months', () => {
    expect(monthsOf(null)).toBe(DEFAULT_MONTHS);
    expect(monthsOf([])).toBe(DEFAULT_MONTHS);
    expect(monthsOf([{ name: 'x' }, 'Ches', null])).toBe(DEFAULT_MONTHS);
  });
});

describe('dateOf', () => {
  it('reads a stored date, or nothing', () => {
    expect(dateOf({ year: 1492, day: 136.2 })).toEqual({ year: 1492, day: 136 });
    expect(dateOf({ year: 1492 })).toBeNull();
    expect(dateOf(null)).toBeNull();
    expect(dateOf('1492')).toBeNull();
  });
});

describe('yearSuffix', () => {
  it('shows what a world counts years as, but not the label every world started with', () => {
    expect(yearSuffix(' DR ')).toBe('DR');
    expect(yearSuffix('Year (Y)')).toBe('');
    expect(yearSuffix(null)).toBe('');
  });
});

describe('months and days', () => {
  it('goes between a day of the year and a day of a month', () => {
    const d = fromMonthDay(1492, mirtul, 14, harptos);
    expect(d).toEqual({ year: 1492, day: 136 });
    expect(toMonthDay(d, harptos)).toEqual({ month: mirtul, dayOfMonth: 14 });
  });

  it('keeps a day inside its month', () => {
    expect(fromMonthDay(1, 0, 45, DEFAULT_MONTHS)).toEqual({ year: 1, day: 30 });
    expect(fromMonthDay(1, 99, 0, DEFAULT_MONTHS)).toEqual({ year: 1, day: 331 });
  });

  it('moves days across the end and start of a year', () => {
    expect(addDays({ year: 1492, day: 364 }, 3, harptos)).toEqual({ year: 1493, day: 2 });
    expect(addDays({ year: 1492, day: 2 }, -3, harptos)).toEqual({ year: 1491, day: 364 });
    expect(normalize({ year: 1, day: 721 }, DEFAULT_MONTHS)).toEqual({ year: 3, day: 1 });
  });

  it('moves a month on to the same day, skipping festivals', () => {
    const tarsakh30 = fromMonthDay(1492, mirtul - 2, 30, harptos);
    expect(formatWorldDate(nextMonth(tarsakh30, harptos), harptos)).toBe('30 Mirtul 1492');
    const nightal = fromMonthDay(1492, harptos.length - 1, 5, harptos);
    expect(formatWorldDate(nextMonth(nightal, harptos), harptos)).toBe('5 Hammer 1493');
  });

  it('moves to the last day of a shorter month', () => {
    const greg = PRESETS.find(p => p.id === 'gregorian')!.months;
    expect(formatWorldDate(nextMonth(fromMonthDay(2026, 0, 31, greg), greg), greg)).toBe('28 February 2026');
  });

  it('counts the days between dates, across years', () => {
    expect(daysBetween({ year: 1492, day: 136 }, { year: 1492, day: 138 }, harptos)).toBe(2);
    expect(daysBetween({ year: 1492, day: 364 }, { year: 1493, day: 2 }, harptos)).toBe(3);
    expect(compareDates({ year: 2, day: 1 }, { year: 1, day: 300 })).toBeGreaterThan(0);
  });
});

describe('formatting', () => {
  it('reads a date with its year suffix; a festival is its own name', () => {
    expect(formatWorldDate({ year: 1492, day: 136 }, harptos, 'DR')).toBe('14 Mirtul 1492 DR');
    expect(formatWorldDate({ year: 1492, day: 31 }, harptos, 'DR')).toBe('Midwinter 1492 DR');
    expect(formatWorldDate({ year: 3, day: 1 }, DEFAULT_MONTHS)).toBe('1 Month 1 3');
  });

  it('reads a span as briefly as it can', () => {
    const at = (month: string, day: number, year = 1492) =>
      fromMonthDay(year, harptos.findIndex(m => m.name === month), day, harptos);
    expect(formatSpan(at('Mirtul', 14), null, harptos, 'DR')).toBe('14 Mirtul 1492 DR');
    expect(formatSpan(at('Mirtul', 14), at('Mirtul', 14), harptos, 'DR')).toBe('14 Mirtul 1492 DR');
    expect(formatSpan(at('Mirtul', 14), at('Mirtul', 16), harptos, 'DR')).toBe('14–16 Mirtul 1492 DR');
    expect(formatSpan(at('Mirtul', 28), at('Kythorn', 2), harptos, 'DR')).toBe('28 Mirtul – 2 Kythorn 1492 DR');
    expect(formatSpan(at('Flamerule', 30), at('Midsummer', 1), harptos)).toBe('30 Flamerule – Midsummer 1492');
    expect(formatSpan(at('Nightal', 30), at('Hammer', 2, 1493), harptos, 'DR')).toBe('30 Nightal 1492 – 2 Hammer 1493 DR');
  });

  it('counts days in words', () => {
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(3)).toBe('3 days');
  });
});
