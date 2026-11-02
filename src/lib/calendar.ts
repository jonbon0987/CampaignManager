// The in-world calendar. A world's year is a list of months, each some number
// of days; a one-day "month" is a festival that sits between months
// (Midwinter, Shieldmeet). A date is a year and a day of that year, counted
// from 1, so time can move on by days and still read "14 Mirtul 1492 DR".

export type Month = { name: string; days: number };
export type WorldDate = { year: number; day: number };

const MAX_MONTH_DAYS = 400;

export const PRESETS: { id: string; label: string; months: Month[] }[] = [
  {
    id: 'twelve',
    label: 'Twelve months of thirty days',
    months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
  },
  {
    id: 'harptos',
    label: 'Harptos (the Forgotten Realms)',
    months: [
      { name: 'Hammer', days: 30 }, { name: 'Midwinter', days: 1 },
      { name: 'Alturiak', days: 30 }, { name: 'Ches', days: 30 }, { name: 'Tarsakh', days: 30 }, { name: 'Greengrass', days: 1 },
      { name: 'Mirtul', days: 30 }, { name: 'Kythorn', days: 30 }, { name: 'Flamerule', days: 30 }, { name: 'Midsummer', days: 1 },
      { name: 'Eleasis', days: 30 }, { name: 'Eleint', days: 30 }, { name: 'Highharvestide', days: 1 },
      { name: 'Marpenoth', days: 30 }, { name: 'Uktar', days: 30 }, { name: 'Feast of the Moon', days: 1 }, { name: 'Nightal', days: 30 },
    ],
  },
  {
    id: 'gregorian',
    label: 'Gregorian (365 days)',
    months: [
      ['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30],
      ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31],
    ].map(([name, days]) => ({ name: name as string, days: days as number })),
  },
];

export const DEFAULT_MONTHS: Month[] = PRESETS[0].months;

/** A world's stored months, or the default when it has none (or they're unusable). */
export function monthsOf(stored: unknown): Month[] {
  if (!Array.isArray(stored)) return DEFAULT_MONTHS;
  const months = stored
    .filter((m): m is Month => !!m && typeof m === 'object' && typeof (m as Month).name === 'string' && Number.isFinite((m as Month).days))
    .map(m => ({ name: m.name.trim() || 'Unnamed month', days: Math.min(MAX_MONTH_DAYS, Math.max(1, Math.round(m.days))) }));
  return months.length > 0 ? months : DEFAULT_MONTHS;
}

/** A stored date, or null when it isn't one. */
export function dateOf(stored: unknown): WorldDate | null {
  if (!stored || typeof stored !== 'object') return null;
  const { year, day } = stored as Partial<WorldDate>;
  return Number.isFinite(year) && Number.isFinite(day) ? { year: Math.round(year!), day: Math.round(day!) } : null;
}

export const daysInYear = (months: Month[]) => months.reduce((n, m) => n + m.days, 0);

/** The year's suffix for display: "DR". The label every world started with means none. */
export function yearSuffix(calendar: string | null | undefined): string {
  const s = (calendar ?? '').trim();
  return s === 'Year (Y)' ? '' : s;
}

/** Which month a day of the year falls in, and the day within it. */
export function toMonthDay(date: WorldDate, months: Month[]): { month: number; dayOfMonth: number } {
  const d = normalize(date, months);
  let left = d.day;
  for (let i = 0; i < months.length; i++) {
    if (left <= months[i].days) return { month: i, dayOfMonth: left };
    left -= months[i].days;
  }
  return { month: months.length - 1, dayOfMonth: months[months.length - 1].days };
}

/** A date from a month (index) and its day, kept inside the month. */
export function fromMonthDay(year: number, month: number, dayOfMonth: number, months: Month[]): WorldDate {
  const m = Math.min(months.length - 1, Math.max(0, month));
  const before = months.slice(0, m).reduce((n, x) => n + x.days, 0);
  return { year, day: before + Math.min(months[m].days, Math.max(1, dayOfMonth)) };
}

/** Brings a day that ran past either end of its year into the right year. */
export function normalize(date: WorldDate, months: Month[]): WorldDate {
  const len = daysInYear(months);
  let { year, day } = date;
  while (day > len) { day -= len; year += 1; }
  while (day < 1) { day += len; year -= 1; }
  return { year, day };
}

export const addDays = (date: WorldDate, days: number, months: Month[]) => normalize({ year: date.year, day: date.day + days }, months);

/** The same day of the next month (or its last day, if shorter). Festivals are skipped. */
export function nextMonth(date: WorldDate, months: Month[]): WorldDate {
  const { month, dayOfMonth } = toMonthDay(date, months);
  let year = date.year;
  let next = month;
  do {
    next += 1;
    if (next >= months.length) { next = 0; year += 1; }
  } while (months[next].days === 1 && months.some(m => m.days > 1) && next !== month);
  return fromMonthDay(year, next, dayOfMonth, months);
}

export function compareDates(a: WorldDate, b: WorldDate): number {
  return a.year - b.year || a.day - b.day;
}

export function daysBetween(from: WorldDate, to: WorldDate, months: Month[]): number {
  const len = daysInYear(months);
  return (to.year - from.year) * len + (to.day - from.day);
}

const withSuffix = (text: string, suffix: string) => (suffix ? `${text} ${suffix}` : text);

/** "14 Mirtul 1492 DR"; a festival day reads "Midwinter 1492 DR". */
export function formatWorldDate(date: WorldDate, months: Month[], suffix = ''): string {
  const { month, dayOfMonth } = toMonthDay(date, months);
  const m = months[month];
  const d = normalize(date, months);
  return withSuffix(`${m.days === 1 ? m.name : `${dayOfMonth} ${m.name}`} ${d.year}`, suffix);
}

/**
 * A stretch of days, as briefly as it reads: "14 Mirtul 1492", "14–16 Mirtul
 * 1492", "28 Mirtul – 2 Kythorn 1492", "30 Nightal 1492 – 2 Hammer 1493".
 */
export function formatSpan(start: WorldDate, end: WorldDate | null, months: Month[], suffix = ''): string {
  const a = normalize(start, months);
  const b = end ? normalize(end, months) : a;
  if (compareDates(a, b) >= 0) return formatWorldDate(a, months, suffix);
  const am = toMonthDay(a, months);
  const bm = toMonthDay(b, months);
  const name = (i: number) => months[i].name;
  const dayName = (md: { month: number; dayOfMonth: number }) =>
    months[md.month].days === 1 ? name(md.month) : `${md.dayOfMonth} ${name(md.month)}`;
  if (a.year !== b.year) return withSuffix(`${dayName(am)} ${a.year} – ${dayName(bm)} ${b.year}`, suffix);
  if (am.month === bm.month) return withSuffix(`${am.dayOfMonth}–${bm.dayOfMonth} ${name(am.month)} ${a.year}`, suffix);
  return withSuffix(`${dayName(am)} – ${dayName(bm)} ${a.year}`, suffix);
}

/** "3 days", "1 day". */
export const daysLabel = (n: number) => `${n} day${Math.abs(n) === 1 ? '' : 's'}`;
