import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeCampaignContext } from '../test/contextMocks';
import { makePC, makeSession } from '../test/fixtures';
import { localToday } from '../lib/sessionLifecycle';

const h = vi.hoisted(() => ({
  campaign: { value: null as Record<string, unknown> | null },
  recording: { value: null as Record<string, unknown> | null },
}));
vi.mock('./CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('./RecordingContext', () => ({ useRecording: () => h.recording.value }));

import { PlayProvider, usePlay } from './PlayContext';

const updateSession = vi.fn();
const upsertSession = vi.fn();
const endRecording = vi.fn();
const markMoment = vi.fn();

function setup(sessions: ReturnType<typeof makeSession>[], recordingSessionId: string | null = null) {
  h.campaign.value = makeCampaignContext({
    sessions,
    pcs: [makePC({ character_name: 'Sam', is_active: true, max_hp: 24, armor_class: 15 } as never)],
    updateSession,
    upsertSession,
  });
  h.recording.value = {
    live: recordingSessionId ? { recording: { id: 'r1', session_id: recordingSessionId } } : null,
    end: endRecording,
    markMoment,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => <PlayProvider>{children}</PlayProvider>;
  return renderHook(() => usePlay(), { wrapper });
}

beforeEach(() => {
  updateSession.mockReset().mockImplementation(async (id: string, patch: object) => ({ id, ...patch }));
  upsertSession.mockReset().mockResolvedValue(makeSession({ id: 'new', session_number: 7, status: 'planned' }));
  endRecording.mockReset().mockResolvedValue(undefined);
  markMoment.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe('starting a session', () => {
  it('makes the chosen planned session live, dated today, with the party in the fight', async () => {
    const { result } = setup([makeSession({ id: 's6', session_number: 6, status: 'planned' })]);
    await act(async () => { await result.current.start({ sessionId: 's6', record: false }); });
    const [id, patch] = updateSession.mock.calls[0];
    expect(id).toBe('s6');
    expect(patch).toMatchObject({ status: 'live', session_date: localToday() });
    expect(patch.play.started_at).toEqual(expect.any(String));
    expect(patch.play.fight.combatants).toEqual([expect.objectContaining({ name: 'Sam', isPC: true, maxHp: 24, ac: 15 })]);
    expect(result.current.recordFor).toBeNull();
  });

  it('creates a session when none is chosen, and asks to set up recording', async () => {
    const { result } = setup([makeSession({ id: 's6', session_number: 6 })]);
    await act(async () => { await result.current.start({ sessionId: null, record: true }); });
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ session_number: 7, status: 'planned' }));
    expect(updateSession.mock.calls[0][0]).toBe('new');
    expect(result.current.recordFor?.id).toBe('new');
  });
});

describe('at the table', () => {
  const live = () => makeSession({ id: 's6', session_number: 6, status: 'live', session_date: '2026-10-29', play: { started_at: '2026-10-29T19:00:00Z' } });

  it('saves notes and rolls onto the session after a pause', async () => {
    vi.useFakeTimers();
    const { result } = setup([live()]);
    act(() => {
      result.current.addNote('  The bell rang twice ');
      result.current.logRoll({ expr: '1d20', total: 17, rolls: [17], count: 1, sides: 20, mod: 0 });
    });
    expect(updateSession).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(updateSession).toHaveBeenCalledTimes(1);
    const [id, { play }] = updateSession.mock.calls[0];
    expect(id).toBe('s6');
    expect(play.notes).toEqual([expect.objectContaining({ text: 'The bell rang twice' })]);
    expect(play.rolls[0]).toMatchObject({ expr: '1d20', total: 17 });
    expect(play.started_at).toBe('2026-10-29T19:00:00Z');
  });

  it('marks a note on the recording when this session is being recorded', () => {
    const { result } = setup([live()], 's6');
    act(() => { result.current.addNote('Ambush'); });
    expect(markMoment).toHaveBeenCalledWith('Ambush');
  });

  it('keeps only the latest 50 rolls', () => {
    const { result } = setup([live()]);
    act(() => {
      for (let i = 0; i < 55; i++) result.current.logRoll({ expr: '1d6', total: i, rolls: [i], count: 1, sides: 6, mod: 0 });
    });
    expect(result.current.play.rolls).toHaveLength(50);
    expect(result.current.play.rolls?.[0].total).toBe(54);
  });
});

describe('ending a session', () => {
  it('stops this session’s recording and marks it played', async () => {
    const { result } = setup([makeSession({ id: 's6', session_number: 6, status: 'live', session_date: null, play: { started_at: 'x' } })], 's6');
    await act(async () => { await result.current.end(); });
    expect(endRecording).toHaveBeenCalledWith('r1');
    const [id, patch] = updateSession.mock.calls.at(-1)!;
    expect(id).toBe('s6');
    expect(patch).toMatchObject({ status: 'done', session_date: localToday() });
    expect(patch.play).toMatchObject({ started_at: 'x', ended_at: expect.any(String) });
  });

  it('leaves a recording of another session running', async () => {
    const { result } = setup([makeSession({ id: 's6', status: 'live' })], 'other');
    await act(async () => { await result.current.end(); });
    expect(endRecording).not.toHaveBeenCalled();
  });
});
