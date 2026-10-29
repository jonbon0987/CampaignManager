// src/hooks/useDiscordBot.ts
// -----------------------------------------------------------
// Whether the Discord bot (bot/) is running, and the channels it can see.
// The bot reports every few seconds; a stale report means it's stopped.
// -----------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { DiscordBotPresenceRows, DISCORD_BOT_STALE_MS, SessionRecordings } from '../lib/db';
import type { DiscordBotPresence, SessionRecording } from '../lib/database.types';

const POLL_MS = 5_000;

export function useDiscordBot(enabled = true) {
  const [presence, setPresence] = useState<DiscordBotPresence | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => DiscordBotPresenceRows.get()
    .then(p => { setPresence(p); setNow(Date.now()); })
    .catch(() => { /* the table may not exist yet (migration 0033); treat as no bot */ })
    .finally(() => setLoaded(true)), []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  const online = !!presence && now - Date.parse(presence.heartbeat_at) < DISCORD_BOT_STALE_MS;
  return { presence, online, loaded, refresh };
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
