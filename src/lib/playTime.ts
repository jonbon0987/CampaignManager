// Time at the table, counted from when the session went live.

/** "0:42", "1:12", "12:05" (hours and minutes) from `since` to `now`. */
export function elapsedLabel(since: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** When a note was taken: its time into the session, or its clock time without a start. */
export function noteStamp(at: string, startedAt?: string): string {
  return startedAt ? elapsedLabel(startedAt, new Date(at).getTime()) : new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
