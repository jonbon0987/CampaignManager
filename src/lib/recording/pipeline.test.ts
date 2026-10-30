import { describe, it, expect } from 'vitest';
import { pipelineStage, WRITE_STALLED_MS } from './pipeline';
import type { RecordingSettings, RecordingStatus, TranscriptionStatus } from '../database.types';

const rec = (status: RecordingStatus, settings: RecordingSettings = {}) => ({ status, status_detail: null, settings });
const tracks = (...s: TranscriptionStatus[]) => s.map(transcription_status => ({ transcription_status }));

describe('pipelineStage', () => {
  it('follows the recording from saving to review', () => {
    expect(pipelineStage(rec('uploading'), [])).toBe('saving');
    expect(pipelineStage(rec('processing'), [])).toBe('saving');
    expect(pipelineStage(rec('processing'), tracks('pending'))).toBe('not-transcribed');
    expect(pipelineStage(rec('processing'), tracks('done', 'submitted'))).toBe('transcribing');
    expect(pipelineStage(rec('processing'), tracks('done', 'done'))).toBe('transcribed');
    expect(pipelineStage(rec('review'), [])).toBe('ready');
    expect(pipelineStage(rec('applied'), [])).toBe('applied');
  });

  it('treats a failed track as not transcribed, to try again', () => {
    expect(pipelineStage(rec('processing'), tracks('done', 'failed'))).toBe('not-transcribed');
  });

  it('shows a chronicle being written, until the write looks stalled', () => {
    const now = Date.parse('2026-10-30T20:00:00Z');
    const started = (ago: number) => rec('processing', { chronicleStartedAt: new Date(now - ago).toISOString() });
    expect(pipelineStage(started(60_000), tracks('done'), now)).toBe('writing');
    expect(pipelineStage(started(WRITE_STALLED_MS + 1), tracks('done'), now)).toBe('transcribed');
  });
});
