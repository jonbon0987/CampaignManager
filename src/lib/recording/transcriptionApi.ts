// src/lib/recording/transcriptionApi.ts
// Client for /api/transcription (see api/transcription.ts).

import { authHeaders } from '../apiClient';
import type { RecordingSettings, RecordingStatus, TranscriptionStatus, TrackSource } from '../database.types';

export interface TranscriptionState {
  recording: { id: string; status: RecordingStatus; status_detail: string | null; duration_ms: number | null };
  tracks: { id: string; label: string | null; source: TrackSource; transcription_status: TranscriptionStatus }[];
}

export async function transcription(recordingId: string, action: 'start' | 'poll'): Promise<TranscriptionState> {
  const res = await fetch('/api/transcription', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ recordingId, action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Transcription request failed (${res.status}).`);
  return body as TranscriptionState;
}

export interface ChronicleSettings {
  depth: 'brief' | 'standard' | 'thorough';
  dropTableTalk: boolean;
  asidesToDmNotes: boolean;
}

/**
 * Writes the chronicle and its proposed changes (see api/chronicle.ts). Takes a minute or two.
 * missingOnly writes just the parts that couldn't be written last time, keeping the rest.
 */
export async function writeChronicle(recordingId: string, campaignContext: string, settings: ChronicleSettings, provider: string, missingOnly = false): Promise<{ count: number; status: RecordingStatus; status_detail: string; settings: RecordingSettings }> {
  const res = await fetch('/api/chronicle', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ recordingId, campaignContext, settings, provider, missingOnly }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Writing the chronicle failed (${res.status}).`);
  return body;
}
