// A thread's clock: an optional track of 4, 6 or 8 segments for something moving
// on its own, like a villain's plan. The DM fills segments between sessions; a
// clock that fills wakes its thread. Pure; useThreadClock saves it.

import type { Hook } from './database.types';

export const CLOCK_SIZES = [4, 6, 8] as const;

export interface ThreadClock {
  size: number;
  filled: number;
  label: string | null;
  full: boolean;
}

type ClockFields = Partial<Pick<Hook, 'clock_size' | 'clock_filled' | 'clock_label'>>;

/** A thread's clock, or null if it has none. */
export function clockOf(h: ClockFields): ThreadClock | null {
  if (!h.clock_size) return null;
  const filled = Math.min(h.clock_size, Math.max(0, h.clock_filled ?? 0));
  return { size: h.clock_size, filled, label: h.clock_label?.trim() || null, full: filled >= h.clock_size };
}

/** "●●●○○○": filled and empty differ in shape, not just colour. */
export const clockDots = (c: Pick<ThreadClock, 'size' | 'filled'>) => '●'.repeat(c.filled) + '○'.repeat(c.size - c.filled);

/** The state a thread is in once its clock reaches `filled`: a full clock wakes a seed or cold thread. */
export function stateAfterClock(state: string, size: number, filled: number): string {
  return filled >= size && (state === 'seed' || state === 'cold') ? 'active' : state;
}

/** What to tell the DM when a clock fills. */
export function clockFullNote(title: string, label: string | null, woke: boolean): string {
  const what = label ? `“${label}” is full` : `The clock on ${title || 'this thread'} is full`;
  return woke ? `${what}, so ${title || 'the thread'} is now Active.` : `${what}.`;
}
