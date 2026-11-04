import { describe, it, expect } from 'vitest';
import { expectedNext, formatTime, formatWhen, nextOnRepeat } from './schedule';

describe('scheduling', () => {
  it('steps on from the last session', () => {
    expect(nextOnRepeat('2026-11-05', 'weekly', '2026-11-06')).toBe('2026-11-12');
    expect(nextOnRepeat('2026-11-05', 'fortnightly', '2026-11-06')).toBe('2026-11-19');
  });

  it('skips meetings already past, and lands on today if it’s the day', () => {
    expect(nextOnRepeat('2026-10-01', 'weekly', '2026-11-04')).toBe('2026-11-05');
    expect(nextOnRepeat('2026-10-29', 'weekly', '2026-11-05')).toBe('2026-11-05');
  });

  it('crosses months and years', () => {
    expect(nextOnRepeat('2026-12-28', 'weekly', '2026-12-29')).toBe('2027-01-04');
  });

  it('goes by the most recent dated session, and keeps its time', () => {
    const sessions = [
      { session_date: '2026-10-01', session_time: '18:00' },
      { session_date: '2026-10-29', session_time: '19:30' },
      { session_date: null, session_time: null },
    ];
    expect(expectedNext(sessions, 'weekly', '2026-11-02')).toEqual({ date: '2026-11-05', time: '19:30' });
  });

  it('goes by the later of two sessions on one day', () => {
    const sessions = [
      { session_number: 6, session_date: '2026-11-02', session_time: '18:00' },
      { session_number: 7, session_date: '2026-11-02', session_time: '19:30' },
    ];
    expect(expectedNext(sessions, 'weekly', '2026-11-04')).toEqual({ date: '2026-11-09', time: '19:30' });
  });

  it('keeps the usual time when the last session left it blank', () => {
    const sessions = [
      { session_number: 5, session_date: '2026-10-26', session_time: '19:30' },
      { session_number: 6, session_date: '2026-11-02', session_time: null },
    ];
    expect(expectedNext(sessions, 'weekly', '2026-11-04')).toEqual({ date: '2026-11-09', time: '19:30' });
    expect(expectedNext([{ session_date: '2026-11-02' }], 'weekly', '2026-11-04')).toEqual({ date: '2026-11-09', time: null });
  });

  it('expects nothing without a repeat, or without a date to go from', () => {
    expect(expectedNext([{ session_date: '2026-10-29' }], null, '2026-11-02')).toBeNull();
    expect(expectedNext([{ session_date: null }], 'weekly', '2026-11-02')).toBeNull();
  });

  it('writes the time and day for people', () => {
    expect(formatTime('19:00')).toBe('7:00 PM');
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:30')).toBe('12:30 PM');
    expect(formatWhen('2026-11-12', '19:00')).toBe('Thu, Nov 12, 2026 at 7:00 PM');
    expect(formatWhen('2026-11-12')).toBe('Thu, Nov 12, 2026');
  });
});
