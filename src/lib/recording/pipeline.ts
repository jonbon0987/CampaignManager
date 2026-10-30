// Where a recording is on its way from audio to a reviewed chronicle.
// Pure, so it's tested without a database (see pipeline.test.ts).

import type { RecordingTrack, SessionRecording } from '../database.types';

export type PipelineStage =
  | 'saving'          // ended; audio still being joined and uploaded
  | 'not-transcribed' // saved, but transcription hasn't run (or failed)
  | 'transcribing'
  | 'transcribed'     // transcript ready, no chronicle yet
  | 'writing'         // the chronicle is being written
  | 'ready'           // written; proposed changes wait for review
  | 'applied';

/** An automatic write that started this long ago without finishing is offered again. */
export const WRITE_STALLED_MS = 10 * 60_000;

export function pipelineStage(
  recording: Pick<SessionRecording, 'status' | 'status_detail' | 'settings'>,
  tracks: Pick<RecordingTrack, 'transcription_status'>[],
  now: number = Date.now(),
): PipelineStage {
  if (recording.status === 'review') return 'ready';
  if (recording.status === 'applied') return 'applied';
  if (recording.status !== 'processing') return 'saving';
  if (tracks.length === 0) return 'saving';
  if (tracks.some(t => t.transcription_status === 'submitted')) return 'transcribing';
  if (!tracks.every(t => t.transcription_status === 'done')) return 'not-transcribed';
  const started = recording.settings.chronicleStartedAt ? Date.parse(recording.settings.chronicleStartedAt) : NaN;
  if (!Number.isNaN(started) && now - started < WRITE_STALLED_MS) return 'writing';
  return 'transcribed';
}

/** What a stage says to the DM, in a few words. */
export const STAGE_LABEL: Record<PipelineStage, string> = {
  saving: 'Saving the audio',
  'not-transcribed': 'Not transcribed yet',
  transcribing: 'Transcribing',
  transcribed: 'Transcribed',
  writing: 'Writing the chronicle',
  ready: 'Ready to review',
  applied: 'In the campaign',
};
