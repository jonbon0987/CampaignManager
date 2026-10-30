import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SessionRecording } from '../lib/database.types';

const h = vi.hoisted(() => ({
  getInProgress: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  tracks: vi.fn(),
  proposals: vi.fn(),
  transcription: vi.fn(),
  write: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('./CampaignContext', () => ({ useCampaign: () => ({ selectedCampaignId: 'c1', sessions: [{ id: 's6', session_number: 6 }] }) }));
vi.mock('./RecordingContext', () => ({ useRecording: () => ({ version: 0 }) }));
vi.mock('./ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../lib/db', () => ({
  SessionRecordings: { getInProgress: h.getInProgress, claimAutoChronicle: h.claim, update: h.update },
  RecordingTracks: { getByRecording: h.tracks },
  ChronicleProposals: { getByRecording: h.proposals },
}));
vi.mock('../lib/recording/transcriptionApi', () => ({ transcription: h.transcription }));
vi.mock('../hooks/useWriteChronicle', () => ({
  useWriteChronicle: () => h.write,
  savedChronicleSettings: () => ({ depth: 'thorough', dropTableTalk: true, asidesToDmNotes: true }),
}));

import { ChroniclePipelineProvider, useChroniclePipeline } from './ChroniclePipelineContext';

const recording = (over: Partial<SessionRecording> = {}) =>
  ({ id: 'r1', session_id: 's6', status: 'processing', status_detail: null, settings: { autoChronicle: true }, ...over }) as SessionRecording;
const done = [{ id: 't1', storage_path: 'a.webm', transcription_status: 'done' }];

const wrapper = ({ children }: { children: React.ReactNode }) => <ChroniclePipelineProvider>{children}</ChroniclePipelineProvider>;
const run = () => renderHook(() => useChroniclePipeline(), { wrapper });

beforeEach(() => {
  Object.values(h).forEach(fn => fn.mockReset());
  h.proposals.mockResolvedValue([]);
  h.update.mockResolvedValue({});
});

describe('the chronicle pipeline', () => {
  it('writes the chronicle once the transcript is done, for a recording set to', async () => {
    h.getInProgress.mockResolvedValue([recording()]);
    h.tracks.mockResolvedValue(done);
    h.claim.mockImplementation(async (r: SessionRecording) => ({ ...r, settings: { ...r.settings, autoChronicle: false, chronicleStartedAt: 'now' } }));
    h.write.mockReturnValue(new Promise(() => {}));
    const { result } = run();
    await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1));
    expect(h.write.mock.calls[0][1]).toEqual({ depth: 'thorough', dropTableTalk: true, asidesToDmNotes: true });
    await waitFor(() => expect(result.current.entries[0]?.stage).toBe('writing'));
  });

  it('leaves the writing to another tab that claimed it first', async () => {
    h.getInProgress.mockResolvedValue([recording()]);
    h.tracks.mockResolvedValue(done);
    h.claim.mockResolvedValue(null);
    const { result } = run();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(h.write).not.toHaveBeenCalled();
  });

  it('only writes for recordings started with it on', async () => {
    h.getInProgress.mockResolvedValue([recording({ settings: {} })]);
    h.tracks.mockResolvedValue(done);
    const { result } = run();
    await waitFor(() => expect(result.current.entries[0]?.stage).toBe('transcribed'));
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('checks on a transcription while it runs', async () => {
    h.getInProgress.mockResolvedValue([recording({ settings: {} })]);
    h.tracks.mockResolvedValue([{ id: 't1', storage_path: 'a.webm', transcription_status: 'submitted' }]);
    h.transcription.mockResolvedValue({ recording: { id: 'r1', status: 'processing' }, tracks: [{ id: 't1', transcription_status: 'done' }] });
    const { result } = run();
    await waitFor(() => expect(result.current.entries[0]?.stage).toBe('transcribed'));
    expect(h.transcription).toHaveBeenCalledWith('r1', 'poll');
  });

  it('counts the changes waiting for review', async () => {
    h.getInProgress.mockResolvedValue([recording({ status: 'review' })]);
    h.proposals.mockResolvedValue([{ status: 'pending' }, { status: 'pending' }, { status: 'skipped' }]);
    const { result } = run();
    await waitFor(() => expect(result.current.entries[0]).toMatchObject({ stage: 'ready', pending: 2 }));
  });

  it('says why when writing fails, and offers the step again', async () => {
    h.getInProgress.mockResolvedValue([recording()]);
    h.tracks.mockResolvedValue(done);
    h.claim.mockImplementation(async (r: SessionRecording) => ({ ...r, settings: { autoChronicle: false, chronicleStartedAt: 'now' } }));
    h.write.mockRejectedValue(new Error('The AI is busy.'));
    const { result } = run();
    await waitFor(() => expect(h.update).toHaveBeenCalledWith('r1', { settings: { autoChronicle: false } }));
    // The next look sees it transcribed again (another tab would too), with the reason.
    h.getInProgress.mockResolvedValue([recording({ settings: { autoChronicle: false } })]);
    result.current.refresh();
    await waitFor(() => expect(result.current.entries[0]).toMatchObject({ stage: 'transcribed', error: 'The AI is busy.' }));
  });
});
