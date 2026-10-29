// src/hooks/useRecordingPlayer.ts
// -----------------------------------------------------------
// Plays a recording from a moment on the session clock. A recorded track
// skips paused time, so the moment is mapped onto the track's audio through its
// chunk timings first. Signed URLs and chunk timings are fetched once per track.
// It also reports where on the session clock playback is, for a progress bar.
// -----------------------------------------------------------

import { useCallback, useRef, useState } from 'react';
import { RecordingChunks, RecordingTracks, SessionAudio } from '../lib/db';
import type { RecordingTrack } from '../lib/database.types';
import { sessionToAudioMs, trackAt, type ChunkTiming } from '../lib/recording/transcript';

/** Start a second early so the line isn't clipped. */
const LEAD_IN_MS = 1_000;

export function useRecordingPlayer() {
  const audio = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<string, string>());
  const chunks = useRef(new Map<string, ChunkTiming[]>());
  const tracks = useRef(new Map<string, RecordingTrack[]>());
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState<number | null>(null);
  // Where playback started, on the session clock and in the audio, so the
  // position can be followed from the audio's own clock.
  const anchor = useRef<{ sessionMs: number; audioSec: number } | null>(null);

  /** Plays `track` from `sessionMs`. */
  const playTrack = useCallback(async (track: RecordingTrack, sessionMs: number) => {
    const el = audio.current;
    if (!el || !track.storage_path) return;
    setLoading(true);
    try {
      if (!urls.current.has(track.id)) urls.current.set(track.id, await SessionAudio.signedUrl(track.storage_path));
      if (!chunks.current.has(track.id)) chunks.current.set(track.id, track.source === 'upload' ? [] : await RecordingChunks.getByTrack(track.id));
      const src = urls.current.get(track.id)!;
      if (el.src !== src) {
        el.src = src;
        await new Promise<void>(r => { el.onloadedmetadata = () => r(); setTimeout(r, 5000); });
      }
      const from = Math.max(0, sessionMs - LEAD_IN_MS);
      el.currentTime = sessionToAudioMs(from, chunks.current.get(track.id)!, track.offset_ms) / 1000;
      anchor.current = { sessionMs: from, audioSec: el.currentTime };
      setPositionMs(from);
      el.ontimeupdate = () => { const a = anchor.current; if (a) setPositionMs(a.sessionMs + Math.max(0, el.currentTime - a.audioSec) * 1000); };
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
      await el.play();
    } finally {
      setLoading(false);
    }
  }, []);

  /** Plays a recording from `sessionMs`, on whichever of its tracks covers that moment. */
  const playRecording = useCallback(async (recordingId: string, sessionMs: number) => {
    if (!tracks.current.has(recordingId)) tracks.current.set(recordingId, await RecordingTracks.getByRecording(recordingId));
    const track = trackAt(tracks.current.get(recordingId)!, sessionMs);
    if (!track) throw new Error('This recording’s audio is no longer kept.');
    await playTrack(track, sessionMs);
  }, [playTrack]);

  const pause = useCallback(() => audio.current?.pause(), []);

  return { audio, loading, playing, positionMs, pause, playTrack, playRecording };
}
