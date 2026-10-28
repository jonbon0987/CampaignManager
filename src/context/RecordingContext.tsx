// src/context/RecordingContext.tsx
// -----------------------------------------------------------
// Recording a session at the table. Lives at the app shell (not inside Session
// Notes) so a recording keeps going while the DM moves between tabs.
//
// Flow: start → the mic is cut into 1-minute chunks, each saved on this device
// and uploaded in the background → end → each track's chunks are joined into
// one file and the recording waits for transcription. A recording left open by
// a reload or crash shows up as "interrupted" and can be resumed (as a new
// track, offset on the session clock) or ended.
// -----------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  SessionRecordings, RecordingTracks, RecordingChunks, RecordingMoments, SessionAudio, sessionAudioPath,
} from '../lib/db';
import type { RecordingMoment, SessionRecording } from '../lib/database.types';
import { ChunkedRecorder, type RecorderLike } from '../lib/recording/chunker';
import { createChunkStore, chunkKey } from '../lib/recording/chunkStore';
import { ChunkUploader, type UploaderStatus } from '../lib/recording/uploader';
import { writeWebmDuration } from '../lib/recording/webmDuration';
import { transcription } from '../lib/recording/transcriptionApi';
import {
  AUDIO_BITS_PER_SECOND, baseMimeType, createLevelMeter, extensionFor, holdWakeLock, openMicrophone,
  pickRecordingMimeType, uploadMimeType,
} from '../lib/recording/audio';
import { useCampaign } from './CampaignContext';

const SAVED_DETAIL = 'Audio saved.';

/**
 * Hands a saved recording to transcription. If that can't start (no key, no
 * connection) the audio is still safe, and the reason is shown on the
 * recording with a button to try again.
 */
async function startTranscription(recordingId: string): Promise<void> {
  try {
    await transcription(recordingId, 'start');
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await SessionRecordings.update(recordingId, { status_detail: `Audio saved. Transcription didn’t start: ${why}`.slice(0, 500) }).catch(() => {});
  }
}

interface Live {
  recording: SessionRecording;
  trackId: string;
  paused: boolean;
  moments: RecordingMoment[];
}

interface RecordingContextValue {
  live: Live | null;
  /** Open recordings in this campaign with no recorder running (reload, crash, failed save). */
  interrupted: SessionRecording[];
  busy: boolean;
  upload: UploaderStatus;
  /** Bumped whenever a recording is created, saved or discarded, so lists can refetch. */
  version: number;
  getLevel: () => number;
  start: (sessionId: string, opts: { deviceId?: string; tablePcIds: string[] }) => Promise<void>;
  resumeInterrupted: (recording: SessionRecording, deviceId?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  markMoment: (label?: string) => Promise<void>;
  renameMoment: (moment: RecordingMoment, label: string) => Promise<void>;
  deleteMoment: (id: string) => Promise<void>;
  end: (recordingId: string) => Promise<void>;
  discard: (recordingId: string) => Promise<void>;
  uploadFile: (sessionId: string, file: File) => Promise<void>;
  retryUploads: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider, as in the other contexts
export function useRecording(): RecordingContextValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording must be inside RecordingProvider');
  return ctx;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export function RecordingProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { selectedCampaignId } = useCampaign();
  const [live, setLive] = useState<Live | null>(null);
  const [interrupted, setInterrupted] = useState<SessionRecording[]>([]);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [upload, setUpload] = useState<UploaderStatus>({ pending: 0, error: null });

  const store = useMemo(() => createChunkStore(), []);
  const uploader = useMemo(() => new ChunkUploader({
    userId,
    store,
    uploadAudio: SessionAudio.upload,
    saveChunkRow: RecordingChunks.save,
    listChunkRows: RecordingChunks.getByTrack,
    fetchAudio: async (path) => {
      const res = await fetch(await SessionAudio.signedUrl(path));
      if (!res.ok) throw new Error(`Couldn't fetch saved audio (${res.status}).`);
      return res.blob();
    },
    // Recorded webm has no real length, so players show 0:00 and can't seek.
    writeDuration: (blob, durationMs) =>
      baseMimeType(blob.type) === 'audio/webm' ? writeWebmDuration(blob, durationMs) : Promise.resolve(blob),
  }), [userId, store]);

  // The running recorder and everything that must be torn down with it.
  const rig = useRef<{ chunker: ChunkedRecorder; stream: MediaStream; meter: { level: () => number; close: () => void }; releaseWake: () => void } | null>(null);
  const liveRef = useRef<Live | null>(null);
  liveRef.current = live;
  // Chunks being written to the device; the final one lands after stop() resolves.
  const pendingPuts = useRef(new Set<Promise<unknown>>());

  const bump = useCallback(() => setVersion(v => v + 1), []);

  // Upload status, plus anything a previous visit left on this device.
  useEffect(() => {
    const unsub = uploader.subscribe(setUpload);
    void uploader.drain();
    const onOnline = () => { void uploader.drain(); };
    window.addEventListener('online', onOnline);
    return () => { unsub(); window.removeEventListener('online', onOnline); uploader.dispose(); };
  }, [uploader]);

  const loadInterrupted = useCallback(async () => {
    if (!selectedCampaignId) { setInterrupted([]); return; }
    try {
      const open = await SessionRecordings.getOpen(selectedCampaignId);
      setInterrupted(open.filter(r => r.id !== liveRef.current?.recording.id));
    } catch (e) {
      console.error('Failed to load open recordings', e);
    }
  }, [selectedCampaignId]);

  useEffect(() => { void loadInterrupted(); }, [loadInterrupted, version]);

  // Warn before closing the tab mid-recording or with audio still to upload.
  useEffect(() => {
    if (!live && upload.pending === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [live, upload.pending]);

  const teardown = useCallback(async () => {
    const r = rig.current;
    if (!r) return;
    rig.current = null;
    await r.chunker.stop();
    r.stream.getTracks().forEach(t => t.stop());
    r.meter.close();
    r.releaseWake();
    await Promise.all(pendingPuts.current);
  }, []);

  // Release the mic if the shell unmounts (sign-out) while recording.
  useEffect(() => () => { void teardown(); }, [teardown]);

  /** Opens the mic and starts a new table track on `recording`. */
  const startTrack = useCallback(async (recording: SessionRecording, deviceId: string | undefined, offsetMs: number) => {
    const mimeType = pickRecordingMimeType();
    if (!mimeType) throw new Error('This browser can’t record audio. Try Chrome, Edge, Firefox or Safari.');
    const stream = await openMicrophone(deviceId);
    try {
      const label = stream.getAudioTracks()[0]?.label || 'Table mic';
      const track = await RecordingTracks.upsert({
        recording_id: recording.id, source: 'table', label, discord_user_id: null, pc_id: null,
        offset_ms: Math.max(0, Math.round(offsetMs)), storage_path: null, mime_type: baseMimeType(mimeType),
        duration_ms: null, transcription_job_id: null,
      });
      const media = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      const chunker = new ChunkedRecorder(media as unknown as RecorderLike, {
        onChunk: (c) => {
          const put = store.put({
            key: chunkKey(track.id, c.seq), recordingId: recording.id, trackId: track.id, seq: c.seq,
            blob: c.blob, mimeType: c.mimeType || mimeType, startMs: c.startMs, durationMs: c.durationMs, uploaded: false,
          }).catch(e => console.error('Failed to keep a recorded chunk on this device', e));
          pendingPuts.current.add(put);
          void put.finally(() => pendingPuts.current.delete(put)).then(() => uploader.drain());
        },
        onError: (e) => console.error('Recorder error', e),
      });
      chunker.start();
      rig.current = { chunker, stream, meter: createLevelMeter(stream), releaseWake: holdWakeLock() };
      const moments = await RecordingMoments.getByRecording(recording.id).catch(() => []);
      setLive({ recording, trackId: track.id, paused: false, moments });
      setInterrupted(prev => prev.filter(r => r.id !== recording.id));
    } catch (e) {
      stream.getTracks().forEach(t => t.stop());
      throw e;
    }
  }, [store, uploader]);

  const start = useCallback<RecordingContextValue['start']>(async (sessionId, { deviceId, tablePcIds }) => {
    if (liveRef.current) throw new Error('A recording is already running.');
    if (!selectedCampaignId) throw new Error('No campaign selected.');
    setBusy(true);
    let recording: SessionRecording | null = null;
    try {
      recording = await SessionRecordings.upsert({
        campaign_id: selectedCampaignId, session_id: sessionId, status: 'recording', status_detail: null,
        ended_at: null, duration_ms: null, audio_expires_at: null, settings: { tablePcIds },
      });
      await startTrack(recording, deviceId, 0);
      bump();
    } catch (e) {
      if (recording) await SessionRecordings.delete(recording.id).catch(() => {});
      throw e;
    } finally {
      setBusy(false);
    }
  }, [selectedCampaignId, startTrack, bump]);

  const resumeInterrupted = useCallback<RecordingContextValue['resumeInterrupted']>(async (recording, deviceId) => {
    if (liveRef.current) throw new Error('A recording is already running.');
    setBusy(true);
    try {
      const resumed = recording.status === 'recording'
        ? recording
        : await SessionRecordings.update(recording.id, { status: 'recording', status_detail: null, ended_at: null });
      await startTrack(resumed, deviceId, Date.now() - Date.parse(resumed.started_at));
      bump();
    } finally {
      setBusy(false);
    }
  }, [startTrack, bump]);

  const pause = useCallback(() => {
    if (!rig.current || !liveRef.current) return;
    rig.current.chunker.pause();
    setLive(l => l && { ...l, paused: true });
  }, []);

  const resume = useCallback(() => {
    if (!rig.current || !liveRef.current) return;
    rig.current.chunker.resume();
    setLive(l => l && { ...l, paused: false });
  }, []);

  const markMoment = useCallback(async (label?: string) => {
    const l = liveRef.current;
    if (!l) return;
    const moment = await RecordingMoments.upsert({
      recording_id: l.recording.id,
      at_ms: Math.max(0, Date.now() - Date.parse(l.recording.started_at)),
      label: label?.trim() || null,
    });
    setLive(cur => cur && { ...cur, moments: [...cur.moments, moment] });
  }, []);

  const renameMoment = useCallback(async (moment: RecordingMoment, label: string) => {
    const saved = await RecordingMoments.upsert({
      id: moment.id, recording_id: moment.recording_id, at_ms: moment.at_ms, label: label.trim() || null,
    });
    setLive(cur => cur && { ...cur, moments: cur.moments.map(m => m.id === saved.id ? saved : m) });
  }, []);

  const deleteMoment = useCallback(async (id: string) => {
    await RecordingMoments.delete(id);
    setLive(cur => cur && { ...cur, moments: cur.moments.filter(m => m.id !== id) });
  }, []);

  // M marks a moment while recording, unless the DM is typing.
  useEffect(() => {
    if (!live || live.paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      void markMoment();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, markMoment]);

  const end = useCallback(async (recordingId: string) => {
    setBusy(true);
    try {
      if (liveRef.current?.recording.id === recordingId) {
        await teardown();
        setLive(null);
      }
      const rec = await SessionRecordings.update(recordingId, { status: 'uploading', ended_at: new Date().toISOString() });
      const tracks = await RecordingTracks.getByRecording(recordingId);
      for (const t of tracks) {
        if (t.source !== 'table' || t.storage_path) continue;
        const joined = await uploader.joinTrack(recordingId, t.id, t.mime_type ?? 'audio/webm');
        if (joined) await RecordingTracks.update(t.id, { storage_path: joined.path, duration_ms: joined.durationMs });
      }
      await SessionRecordings.update(recordingId, {
        status: 'processing',
        status_detail: SAVED_DETAIL,
        duration_ms: Date.parse(rec.ended_at ?? new Date().toISOString()) - Date.parse(rec.started_at),
      });
      await startTranscription(recordingId);
    } finally {
      setBusy(false);
      bump();
    }
  }, [teardown, uploader, bump]);

  const discard = useCallback(async (recordingId: string) => {
    setBusy(true);
    try {
      if (liveRef.current?.recording.id === recordingId) {
        await teardown();
        setLive(null);
      }
      const tracks = await RecordingTracks.getByRecording(recordingId);
      const paths: string[] = [];
      for (const t of tracks) {
        if (t.storage_path) paths.push(t.storage_path);
        for (const c of await RecordingChunks.getByTrack(t.id)) paths.push(c.storage_path);
      }
      await store.removeRecording(recordingId);
      await SessionAudio.remove(paths);
      await SessionRecordings.delete(recordingId);
    } finally {
      setBusy(false);
      bump();
    }
  }, [teardown, store, bump]);

  const uploadFile = useCallback(async (sessionId: string, file: File) => {
    if (!selectedCampaignId) throw new Error('No campaign selected.');
    const mime = uploadMimeType(file);
    if (!mime) throw new Error('That file isn’t an audio format this can store (try .m4a, .mp3, .wav, .ogg, .webm or .flac).');
    setBusy(true);
    let recording: SessionRecording | null = null;
    try {
      recording = await SessionRecordings.upsert({
        campaign_id: selectedCampaignId, session_id: sessionId, status: 'uploading', status_detail: null,
        ended_at: new Date().toISOString(), duration_ms: null, audio_expires_at: null, settings: {},
      });
      const track = await RecordingTracks.upsert({
        recording_id: recording.id, source: 'upload', label: file.name.slice(0, 120), discord_user_id: null, pc_id: null,
        offset_ms: 0, storage_path: null, mime_type: mime, duration_ms: null, transcription_job_id: null,
      });
      const path = sessionAudioPath(userId, recording.id, track.id, `full.${extensionFor(mime)}`);
      await SessionAudio.upload(path, file, mime);
      await RecordingTracks.update(track.id, { storage_path: path });
      await SessionRecordings.update(recording.id, { status: 'processing', status_detail: SAVED_DETAIL });
      await startTranscription(recording.id);
    } catch (e) {
      if (recording) await SessionRecordings.delete(recording.id).catch(() => {});
      throw e;
    } finally {
      setBusy(false);
      bump();
    }
  }, [selectedCampaignId, userId, bump]);

  const getLevel = useCallback(() => (rig.current && !liveRef.current?.paused ? rig.current.meter.level() : 0), []);
  const retryUploads = useCallback(() => { void uploader.drain(); }, [uploader]);

  const value = useMemo<RecordingContextValue>(() => ({
    live, interrupted, busy, upload, version, getLevel, start, resumeInterrupted, pause, resume,
    markMoment, renameMoment, deleteMoment, end, discard, uploadFile, retryUploads,
  }), [live, interrupted, busy, upload, version, getLevel, start, resumeInterrupted, pause, resume,
    markMoment, renameMoment, deleteMoment, end, discard, uploadFile, retryUploads]);

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
