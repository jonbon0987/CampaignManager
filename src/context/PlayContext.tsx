// The session being played, and what's happening at the table: the fight, the
// dice log, notes and the scene in play. It's saved onto the session as it
// changes, so a reload or a crash picks up where the table left off.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useCampaign } from './CampaignContext';
import { useRecording } from './RecordingContext';
import { blankSession, liveSession, localToday, nextSessionNumber } from '../lib/sessionLifecycle';
import { EMPTY_FIGHT, combatantsFromParty, partyFrom, type Fight } from '../lib/combat';
import type { DiceRoll } from '../lib/dice';
import type { Session, SessionPlay } from '../lib/database.types';

const SAVE_DELAY = 600;
const MAX_ROLLS = 50;

/** The table tools docked in the rail during play. */
export type PlayTab = 'initiative' | 'dice' | 'notes' | 'record';

interface PlayContextValue {
  /** The session being played, if one is live. */
  live: Session | null;
  play: SessionPlay;
  fight: Fight;
  /** The Start session dialog. */
  startOpen: boolean;
  openStart: () => void;
  closeStart: () => void;
  /** A session just started with recording asked for, waiting on the recorder's consent step. */
  recordFor: Session | null;
  clearRecordFor: () => void;
  /** Makes a session live (a new one when no id is given). */
  start: (opts: { sessionId?: string | null; record: boolean }) => Promise<Session | null>;
  /** Marks the live session played, stopping its recording. */
  end: () => Promise<Session | null>;
  setFight: Dispatch<SetStateAction<Fight>>;
  logRoll: (roll: DiceRoll) => void;
  addNote: (text: string) => void;
  removeNote: (id: string) => void;
  setScene: (id: string | null) => void;
  /** Which table tool the rail shows. */
  tab: PlayTab;
  setTab: (tab: PlayTab) => void;
}

const PlayContext = createContext<PlayContextValue | null>(null);

export function PlayProvider({ children }: { children: ReactNode }) {
  const { sessions, pcs, upsertSession, updateSession } = useCampaign();
  const recording = useRecording();
  const live = liveSession(sessions);
  const liveId = live?.id ?? null;

  const [play, setPlay] = useState<SessionPlay>(() => live?.play ?? {});
  const [startOpen, setStartOpen] = useState(false);
  const [recordFor, setRecordFor] = useState<Session | null>(null);
  const [tab, setTab] = useState<PlayTab>('initiative');

  // The context's mutators are re-made each render, so read them through refs.
  const update = useRef(updateSession);
  const recorder = useRef(recording);
  useEffect(() => { update.current = updateSession; recorder.current = recording; });

  // Load the table state when a session goes live (or the page reloads mid-game).
  const loadedFor = useRef<string | null>(liveId);
  useEffect(() => {
    if (loadedFor.current === liveId) return;
    loadedFor.current = liveId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting the new live session's saved state
    setPlay(live?.play ?? {});
  }, [liveId, live?.play]);

  // Save changes after a short pause; a pending save goes out before the
  // provider goes away (switching campaign).
  const pending = useRef<{ id: string; play: SessionPlay } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current;
    pending.current = null;
    if (p) void update.current(p.id, { play: p.play }).catch(() => {});
  }, []);
  useEffect(() => flush, [flush]);

  const change = useCallback((next: (p: SessionPlay) => SessionPlay) => {
    if (!loadedFor.current) return;
    const id = loadedFor.current;
    setPlay(prev => {
      const p = next(prev);
      pending.current = { id, play: p };
      return p;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  const start = useCallback(async ({ sessionId, record }: { sessionId?: string | null; record: boolean }) => {
    const target = sessionId
      ? sessions.find(s => s.id === sessionId) ?? null
      : await upsertSession(blankSession(nextSessionNumber(sessions)));
    if (!target?.id) return null;
    const saved = await update.current(target.id, {
      status: 'live',
      session_date: target.session_date ?? localToday(),
      play: {
        ...(target.play ?? {}),
        started_at: target.play?.started_at ?? new Date().toISOString(),
        // The party is at the table from the start, ready for the first fight.
        fight: target.play?.fight ?? { ...EMPTY_FIGHT, combatants: combatantsFromParty(partyFrom(pcs)) },
      },
    });
    setStartOpen(false);
    if (record) setRecordFor(saved);
    return saved;
  }, [sessions, pcs, upsertSession]);

  const end = useCallback(async () => {
    if (!live) return null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    pending.current = null;
    const rec = recorder.current.live?.recording;
    if (rec && rec.session_id === live.id) await recorder.current.end(rec.id).catch(() => {});
    return update.current(live.id, {
      status: 'done',
      session_date: live.session_date ?? localToday(),
      play: { ...play, ended_at: new Date().toISOString() },
    });
  }, [live, play]);

  const setFight = useCallback<Dispatch<SetStateAction<Fight>>>(action => {
    change(p => {
      const prev = p.fight ?? EMPTY_FIGHT;
      return { ...p, fight: typeof action === 'function' ? action(prev) : action };
    });
  }, [change]);

  const logRoll = useCallback((r: DiceRoll) => {
    change(p => ({ ...p, rolls: [{ at: new Date().toISOString(), expr: r.expr, total: r.total, rolls: r.rolls }, ...(p.rolls ?? [])].slice(0, MAX_ROLLS) }));
  }, [change]);

  const addNote = useCallback((text: string) => {
    const body = text.trim();
    if (!body) return;
    change(p => ({ ...p, notes: [...(p.notes ?? []), { id: crypto.randomUUID(), at: new Date().toISOString(), text: body }] }));
    // While recording, the note also lands on the recording's timeline, so
    // the chronicle sees it beside the moments marked with M.
    const rec = recorder.current.live;
    if (rec && rec.recording.session_id === loadedFor.current) void recorder.current.markMoment(body).catch(() => {});
  }, [change]);

  const removeNote = useCallback((id: string) => {
    change(p => ({ ...p, notes: (p.notes ?? []).filter(n => n.id !== id) }));
  }, [change]);

  const setScene = useCallback((id: string | null) => change(p => ({ ...p, scene_id: id })), [change]);

  const value = useMemo<PlayContextValue>(() => ({
    live,
    play,
    fight: play.fight ?? EMPTY_FIGHT,
    startOpen,
    openStart: () => setStartOpen(true),
    closeStart: () => setStartOpen(false),
    recordFor,
    clearRecordFor: () => setRecordFor(null),
    start,
    end,
    setFight,
    logRoll,
    addNote,
    removeNote,
    setScene,
    tab,
    setTab,
  }), [live, play, startOpen, recordFor, start, end, setFight, logRoll, addNote, removeNote, setScene, tab]);

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider, as in the other contexts
export function usePlay(): PlayContextValue {
  const ctx = useContext(PlayContext);
  if (!ctx) throw new Error('usePlay must be inside PlayProvider');
  return ctx;
}
