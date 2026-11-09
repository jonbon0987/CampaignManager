// src/hooks/useDiscordBot.ts
// -----------------------------------------------------------
// The Discord bot (bot/) as the app sees it: whether its helper is running,
// whether it's signed in to Discord and where it's sitting, and the controls
// that ask it to change. The bot reports every few seconds; a stale report
// means nothing is running. Asking writes a row the bot reads (migration 0053),
// so this works wherever the bot runs.
// -----------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { DiscordBotControlRows, DiscordBotPresenceRows, DISCORD_BOT_STALE_MS, SessionRecordings } from '../lib/db';
import type { DiscordBotControl, DiscordBotPresence, DiscordTarget, SessionRecording } from '../lib/database.types';

const POLL_MS = 5_000;
/** Right after a button, look more often, so the change shows as soon as the bot makes it. */
const QUICK_POLL_MS = 1_000;
const QUICK_FOR_MS = 20_000;

export type BotStatus = 'checking' | 'not-running' | 'offline' | 'connecting' | 'online' | 'error';

/** How the bot stands, from its last report. Pure. */
export function botStatus(presence: DiscordBotPresence | null, loaded: boolean, now: number): { status: BotStatus; running: boolean; online: boolean } {
  if (!loaded) return { status: 'checking', running: false, online: false };
  const fresh = (at: string | null | undefined) => !!at && now - Date.parse(at) < DISCORD_BOT_STALE_MS;
  // A bot from before the helper reports only a heartbeat, and only while signed in.
  if (!presence?.discord_status) {
    const online = fresh(presence?.heartbeat_at);
    return { status: online ? 'online' : 'not-running', running: online, online };
  }
  if (!fresh(presence.helper_at)) return { status: 'not-running', running: false, online: false };
  return { status: presence.discord_status, running: true, online: presence.discord_status === 'online' };
}

export type DiscordBot = ReturnType<typeof useDiscordBot>;

export function useDiscordBot(enabled = true) {
  const [presence, setPresence] = useState<DiscordBotPresence | null>(null);
  const [control, setControlRow] = useState<Pick<DiscordBotControl, 'online' | 'voice'> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [quickUntil, setQuickUntil] = useState(0);

  const refresh = useCallback(() => Promise.all([
    DiscordBotPresenceRows.get().then(setPresence),
    DiscordBotControlRows.get().then(c => setControlRow(c ? { online: c.online, voice: c.voice } : null)).catch(() => { /* migration 0053 not run yet */ }),
  ])
    .catch(() => { /* the table may not exist yet (migration 0033); treat as no bot */ })
    .finally(() => { setNow(Date.now()); setLoaded(true); }), []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const every = quickUntil > Date.now() ? QUICK_POLL_MS : POLL_MS;
    const timer = setInterval(() => {
      void refresh();
      if (every === QUICK_POLL_MS && Date.now() > quickUntil) setQuickUntil(0);
    }, every);
    return () => clearInterval(timer);
  }, [enabled, refresh, quickUntil]);

  /** Asks the bot to sign in or out, or to sit in a voice channel (null to leave). */
  const setControl = useCallback(async (patch: { online?: boolean; voice?: DiscordTarget | null }) => {
    setControlRow(prev => ({ online: prev?.online ?? false, voice: prev?.voice ?? null, ...patch }));
    setQuickUntil(Date.now() + QUICK_FOR_MS);
    const saved = await DiscordBotControlRows.set(patch);
    setControlRow({ online: saved.online, voice: saved.voice });
  }, []);

  return { presence, control, loaded, refresh, setControl, ...botStatus(presence, loaded, now) };
}

/** What the bot reports about a recording's Discord capture, refreshed every few seconds. */
export function useDiscordCapture(recording: SessionRecording | null) {
  const [row, setRow] = useState<Pick<SessionRecording, 'discord_state' | 'discord_detail'> | null>(recording);
  const id = recording?.discord_state ? recording.id : null;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = () => SessionRecordings.get(id).then(r => { if (!cancelled && r) setRow(r); }).catch(() => {});
    void tick();
    const timer = setInterval(tick, 4_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id]);
  return id ? row : null;
}
