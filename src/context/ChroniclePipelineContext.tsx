// From recording to chronicle without anyone pressing buttons. Once a session's
// recording ends, its audio is saved and sent for transcription (the recorder
// does that); this watches every recording on its way, checks on transcription
// while it runs, and writes the chronicle as soon as the transcript is ready,
// for recordings started with that turned on. Home and the session's Recap
// read where each one is.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useCampaign } from './CampaignContext';
import { useRecording } from './RecordingContext';
import { useToast } from './ToastContext';
import { ChronicleProposals, RecordingTracks, SessionRecordings } from '../lib/db';
import { transcription } from '../lib/recording/transcriptionApi';
import { savedChronicleSettings, useWriteChronicle } from '../hooks/useWriteChronicle';
import { pipelineStage, type PipelineStage } from '../lib/recording/pipeline';
import type { SessionRecording } from '../lib/database.types';

const POLL_MS = 8_000;

export interface PipelineEntry {
  recording: SessionRecording;
  stage: PipelineStage;
  /** Proposed changes still to review, once the chronicle is written. */
  pending: number;
  /** Why it stopped, when an automatic step failed. */
  error: string | null;
}

interface PipelineValue {
  entries: PipelineEntry[];
  entryFor: (recordingId: string) => PipelineEntry | undefined;
  /** Look again now (after a manual step, say). */
  refresh: () => void;
}

const PipelineContext = createContext<PipelineValue | null>(null);

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ChroniclePipelineProvider({ children }: { children: ReactNode }) {
  const { selectedCampaignId, sessions } = useCampaign();
  const { version } = useRecording();
  const toast = useToast();
  const write = useWriteChronicle();
  const [entries, setEntries] = useState<PipelineEntry[]>([]);

  // Read through refs: the writer and toast are re-made each render.
  const writeRef = useRef(write);
  const toastRef = useRef(toast);
  const sessionsRef = useRef(sessions);
  useEffect(() => { writeRef.current = write; toastRef.current = toast; sessionsRef.current = sessions; });

  const failed = useRef(new Map<string, string>());
  const ready = useRef<Set<string> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  const tick = useCallback(async () => {
    if (!selectedCampaignId) { setEntries([]); return; }
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      const recordings = await SessionRecordings.getInProgress(selectedCampaignId);
      const next: PipelineEntry[] = [];
      for (let recording of recordings) {
        let tracks = recording.status === 'processing'
          ? (await RecordingTracks.getByRecording(recording.id)).filter(t => t.storage_path)
          : [];
        // While AssemblyAI works, the server checks in and saves what's finished.
        if (tracks.some(t => t.transcription_status === 'submitted')) {
          try {
            const state = await transcription(recording.id, 'poll');
            recording = { ...recording, ...state.recording };
            tracks = tracks.map(t => ({ ...t, transcription_status: state.tracks.find(s => s.id === t.id)?.transcription_status ?? t.transcription_status }));
          } catch {
            // A failed check is retried on the next pass.
          }
        }
        let stage = pipelineStage(recording, tracks);
        if (stage === 'writing' && failed.current.has(recording.id)) stage = 'transcribed';

        // Transcribed and set to write itself: take it on, unless another tab has.
        if (stage === 'transcribed' && recording.settings.autoChronicle === true && !failed.current.has(recording.id)) {
          const claimed = await SessionRecordings.claimAutoChronicle(recording).catch(() => null);
          if (claimed) {
            recording = claimed;
            stage = 'writing';
            void writeRef.current(claimed, savedChronicleSettings(claimed))
              .catch(async e => {
                failed.current.set(claimed.id, errorMessage(e));
                // No longer writing: offer the button again (in other tabs too).
                const settings = { ...claimed.settings };
                delete settings.chronicleStartedAt;
                await SessionRecordings.update(claimed.id, { settings }).catch(() => {});
              })
              .finally(() => { void tickRef.current(); });
          }
        }

        const pending = recording.status === 'review'
          ? (await ChronicleProposals.getByRecording(recording.id)).filter(p => p.status === 'pending').length
          : 0;
        next.push({ recording, stage, pending, error: failed.current.get(recording.id) ?? null });
      }

      // Say so when a chronicle becomes ready while the app is open.
      const nowReady = new Set(next.filter(e => e.stage === 'ready').map(e => e.recording.id));
      if (ready.current) {
        for (const e of next) {
          if (e.stage !== 'ready' || ready.current.has(e.recording.id)) continue;
          const n = sessionsRef.current.find(s => s.id === e.recording.session_id)?.session_number;
          toastRef.current(`The chronicle${n ? ` of Session ${n}` : ''} is ready to review`, 'success');
        }
      }
      ready.current = nowReady;
      setEntries(next);
    } catch {
      // Offline or signed out: try again on the next pass.
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; void tickRef.current(); }
    }
  }, [selectedCampaignId]);

  const tickRef = useRef(tick);
  useEffect(() => { tickRef.current = tick; });

  // Look when the campaign opens and whenever a recording starts, ends or is
  // uploaded (the recorder bumps its version).
  useEffect(() => {
    ready.current = null;
    void tick();
  }, [tick, version]);

  // Keep checking while something is on its way.
  const moving = entries.some(e => e.stage === 'saving' || e.stage === 'transcribing' || e.stage === 'writing');
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => void tickRef.current(), POLL_MS);
    return () => clearInterval(t);
  }, [moving]);

  const refresh = useCallback(() => void tickRef.current(), []);
  const value = useMemo<PipelineValue>(() => ({
    entries,
    entryFor: id => entries.find(e => e.recording.id === id),
    refresh,
  }), [entries, refresh]);

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider, as in the other contexts
export function useChroniclePipeline(): PipelineValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('useChroniclePipeline must be inside ChroniclePipelineProvider');
  return ctx;
}

const EMPTY: PipelineValue = { entries: [], entryFor: () => undefined, refresh: () => {} };

/** The pipeline, or nothing outside the campaign shell (tests, the world). */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useChroniclePipelineMaybe(): PipelineValue {
  return useContext(PipelineContext) ?? EMPTY;
}
