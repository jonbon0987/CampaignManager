import { describe, it, expect } from 'vitest';
import { makeSession } from '../test/fixtures';
import {
  blankSession, clip, localToday, lastPlayed, liveSession, nextPlanned, nextSessionNumber, planIds, plainText,
  prepDone, prepProgress, sessionName, withPlanIds,
} from './sessionLifecycle';

const s = (n: number, status: 'planned' | 'live' | 'done', over = {}) =>
  makeSession({ id: `s${n}`, session_number: n, status, ...over });

describe('session lifecycle', () => {
  const sessions = [s(1, 'done'), s(2, 'done'), s(4, 'planned'), s(3, 'planned')];

  it('numbers a new session after the highest so far', () => {
    expect(nextSessionNumber(sessions)).toBe(5);
    expect(nextSessionNumber([])).toBe(1);
  });

  it('picks the earliest planned session as next, whatever the list order', () => {
    expect(nextPlanned(sessions)?.id).toBe('s3');
    expect(nextPlanned([s(1, 'done')])).toBeNull();
  });

  it('finds the latest played session, or the latest before a number', () => {
    expect(lastPlayed(sessions)?.id).toBe('s2');
    expect(lastPlayed(sessions, 2)?.id).toBe('s1');
    expect(lastPlayed(sessions, 1)).toBeNull();
  });

  it('finds the live session', () => {
    expect(liveSession(sessions)).toBeNull();
    expect(liveSession([...sessions, s(5, 'live')])?.id).toBe('s5');
  });

  it('names a session by number, with its title once it has one', () => {
    expect(sessionName(s(7, 'done'))).toBe('Session 7');
    expect(sessionName(s(7, 'done', { title: 'The Drowned Portico' }))).toBe('Session 7 · The Drowned Portico');
  });

  it('starts a blank session planned, with an empty plan', () => {
    expect(blankSession(6)).toMatchObject({ session_number: 6, status: 'planned', session_date: null, plan: {} });
    expect(blankSession(6, 'live').status).toBe('live');
  });
});

describe('session plan', () => {
  it('reads and replaces one part of the plan, keeping the rest', () => {
    const plan = withPlanIds({ hook_ids: ['h1'] }, 'agenda', ['sc1', 'sc2']);
    expect(plan).toEqual({ hook_ids: ['h1'], scene_ids: ['sc1', 'sc2'] });
    expect(planIds(plan, 'agenda')).toEqual(['sc1', 'sc2']);
    expect(planIds(plan, 'encounters')).toEqual([]);
    expect(planIds(null, 'threads')).toEqual([]);
  });

  it('ignores a malformed plan entry', () => {
    expect(planIds({ npc_ids: 'n1' as unknown as string[] }, 'npcs')).toEqual([]);
  });

  it('counts the prep parts that have something in them', () => {
    const prep = { plan: { hook_ids: ['h1'], encounter_ids: [] }, prep_notes: '  ' };
    expect(prepDone(prep)).toEqual({ agenda: false, threads: true, encounters: false, npcs: false, notes: false });
    expect(prepProgress({ ...prep, prep_notes: 'Bring the map' })).toEqual({ done: 2, total: 5 });
  });
});

describe('dates', () => {
  it('gives the local date, not the UTC one', () => {
    expect(localToday(new Date(2026, 9, 29, 23, 30))).toBe('2026-10-29');
    expect(localToday(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});

describe('previews', () => {
  it('reduces markdown and mentions to text', () => {
    expect(plainText('## Met @[Brenna](npc:abc-1) at **the docks**\n\n> rain')).toBe('Met Brenna at the docks rain');
  });

  it('clips at a word break', () => {
    expect(clip('one two three four', 9)).toBe('one two…');
    expect(clip('short', 9)).toBe('short');
  });
});
