// Where each session stands, planned → live → done, and what its prep covers.

import type { Session, SessionInsert, SessionPlan, SessionRepeat } from './database.types';
import { expectedNext } from './schedule';
import { plainList } from './recording/chronicleView';

const byNumber = (a: Session, b: Session) => a.session_number - b.session_number;

/** The number a new session takes: one past the highest so far. */
export function nextSessionNumber(sessions: Session[]): number {
  return sessions.length ? Math.max(...sessions.map(s => s.session_number)) + 1 : 1;
}

/** A new, empty session, ready to plan (or to play, with status 'live'). */
export function blankSession(session_number: number, status: Session['status'] = 'planned'): Omit<SessionInsert, 'campaign_id'> {
  return {
    session_number, session_date: null, status, title: null, prep_notes: null, plan: {}, play: {},
    summary: null, combats: null, loot_rewards: null, hooks_notes: null, dm_notes: null,
  };
}

/** The next new session, dated on from the last if the campaign meets on a repeat. */
export function nextBlankSession(sessions: Session[], repeat: SessionRepeat | null | undefined): Omit<SessionInsert, 'campaign_id'> {
  const expected = expectedNext(sessions, repeat, localToday());
  return { ...blankSession(nextSessionNumber(sessions)), ...(expected ? { session_date: expected.date, session_time: expected.time } : {}) };
}

/** The session being played now, if any. */
export function liveSession(sessions: Session[]): Session | null {
  return sessions.find(s => s.status === 'live') ?? null;
}

/** The next session to play: the earliest one still planned. */
export function nextPlanned(sessions: Session[]): Session | null {
  return sessions.filter(s => s.status === 'planned').sort(byNumber)[0] ?? null;
}

/** The latest session played, or the latest played before `before`. */
export function lastPlayed(sessions: Session[], before?: number): Session | null {
  const done = sessions.filter(s => s.status === 'done' && (before === undefined || s.session_number < before));
  return done.sort(byNumber).at(-1) ?? null;
}

/** "Session 7", or "Session 7 · The Drowned Portico" once it has a title. */
export function sessionName(s: Pick<Session, 'session_number' | 'title'>): string {
  return s.title ? `Session ${s.session_number} · ${s.title}` : `Session ${s.session_number}`;
}

export const STATUS_LABEL: Record<Session['status'], string> = {
  planned: 'Planned',
  live: 'Live',
  done: 'Played',
};

/** The parts of a session's prep, in the order Prep shows them. */
export const PREP_PARTS = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'threads', label: 'Threads to dangle' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'npcs', label: 'Likely NPCs' },
  { id: 'notes', label: 'Prep notes' },
] as const;
export type PrepPart = (typeof PREP_PARTS)[number]['id'];

const PLAN_KEY: Record<Exclude<PrepPart, 'notes'>, keyof SessionPlan> = {
  agenda: 'scene_ids',
  threads: 'hook_ids',
  encounters: 'encounter_ids',
  npcs: 'npc_ids',
};

/** The ids a prep part links to. */
export function planIds(plan: SessionPlan | null | undefined, part: Exclude<PrepPart, 'notes'>): string[] {
  const ids = plan?.[PLAN_KEY[part]];
  return Array.isArray(ids) ? ids : [];
}

/** The plan with one part's links replaced. */
export function withPlanIds(plan: SessionPlan | null | undefined, part: Exclude<PrepPart, 'notes'>, ids: string[]): SessionPlan {
  return { ...(plan ?? {}), [PLAN_KEY[part]]: ids };
}

/** Which prep parts have something in them. */
export function prepDone(s: Pick<Session, 'plan' | 'prep_notes'>): Record<PrepPart, boolean> {
  return {
    agenda: planIds(s.plan, 'agenda').length > 0,
    threads: planIds(s.plan, 'threads').length > 0,
    encounters: planIds(s.plan, 'encounters').length > 0,
    npcs: planIds(s.plan, 'npcs').length > 0,
    notes: !!s.prep_notes?.trim(),
  };
}

/** How many prep parts are filled in. */
export function prepProgress(s: Pick<Session, 'plan' | 'prep_notes'>): { done: number; total: number } {
  const parts = Object.values(prepDone(s));
  return { done: parts.filter(Boolean).length, total: parts.length };
}

/** Today's date where the DM is, as YYYY-MM-DD. (toISOString would give UTC's, a day out in the evening.) */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Oct 26, 2026" for a session's ISO date. */
export function formatSessionDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Markdown and @-mentions reduced to readable text, for previews. */
export function plainText(md: string): string {
  return md
    .replace(/@\[([^\]]+)\]\([a-z]+:[\w-]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut to about `max` characters at a word break. */
export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}

/** What the table hears at the start of a session: the story so far, and where it stopped. */
export interface PreviouslyOn {
  /** The latest played session, whose "left open" and stopping point these are. */
  last: Session;
  /** The latest played session with a recap written, and that recap as plain text. */
  recapFrom: Session | null;
  recap: string;
  leftOpen: string[];
  stopped: string | null;
  /** Sessions played after the recap's that have none of their own. */
  unrecapped: Session[];
}

/**
 * "Previously on…" for the session after `before` (default: the next one).
 * The recap comes from the latest session that has one, so a few sessions
 * without recaps still leave something to read.
 */
export function previouslyOn(sessions: Session[], before?: number): PreviouslyOn | null {
  const done = sessions.filter(s => s.status === 'done' && (before === undefined || s.session_number < before)).sort(byNumber);
  const last = done.at(-1);
  if (!last) return null;
  const recapFrom = [...done].reverse().find(s => s.summary?.trim()) ?? null;
  return {
    last,
    recapFrom,
    recap: recapFrom?.summary ? plainText(recapFrom.summary) : '',
    leftOpen: leftOpenLines(last.hooks_notes),
    stopped: last.play?.stopped?.trim() || null,
    unrecapped: recapFrom ? done.filter(s => s.session_number > recapFrom.session_number && !s.summary?.trim()) : done,
  };
}

/** "Session 5" or "Sessions 4–6", for a list of sessions in order. */
export function sessionRange(sessions: Pick<Session, 'session_number'>[]): string {
  if (sessions.length === 0) return '';
  const first = sessions[0].session_number;
  const last = sessions[sessions.length - 1].session_number;
  return first === last ? `Session ${first}` : `Sessions ${first}–${last}`;
}

/** What a session left open, a line each: a bulleted list's items, else its lines. */
export function leftOpenLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return (plainList(text) ?? text.split('\n')).map(l => plainText(l)).filter(Boolean);
}
