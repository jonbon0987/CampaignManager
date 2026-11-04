// When the table meets: a date and time on a session, and how a campaign
// repeats, so the next session can be dated on from the last. Pure.

import type { SessionRepeat } from './database.types';

const EVERY: Record<SessionRepeat, number> = { weekly: 7, fortnightly: 14 };

export const REPEATS: { id: SessionRepeat; label: string }[] = [
  { id: 'weekly', label: 'Every week' },
  { id: 'fortnightly', label: 'Every two weeks' },
];

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The first meeting on the repeat that's after `from` and isn't before today. */
export function nextOnRepeat(from: string, repeat: SessionRepeat, today: string): string {
  let next = shift(from, EVERY[repeat]);
  while (next < today) next = shift(next, EVERY[repeat]);
  return next;
}

/**
 * When the next session falls, going by the most recent one with a date, at the
 * last time anyone wrote down: one session with its time left blank doesn't lose it.
 */
export function expectedNext(
  sessions: { session_date: string | null; session_time?: string | null; session_number?: number }[],
  repeat: SessionRepeat | null | undefined,
  today: string,
): { date: string; time: string | null } | null {
  if (!repeat) return null;
  const dated = sessions
    .filter(s => s.session_date)
    .sort((a, b) => b.session_date!.localeCompare(a.session_date!) || (b.session_number ?? 0) - (a.session_number ?? 0));
  if (dated.length === 0) return null;
  return { date: nextOnRepeat(dated[0].session_date!, repeat, today), time: dated.find(s => s.session_time)?.session_time ?? null };
}

/** "7:00 PM" from "19:00". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Thu, Nov 12, 2026 at 7:00 PM", or just the day. */
export function formatWhen(date: string, time?: string | null): string {
  const day = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return time ? `${day} at ${formatTime(time)}` : day;
}
