import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RecordingTrack, SessionRecording, TranscriptSegment } from '../../lib/database.types';

const h = vi.hoisted(() => ({
  segments: [] as unknown[],
  tracks: [] as unknown[],
  playTrack: vi.fn(),
  playRecording: vi.fn(),
  pause: vi.fn(),
}));
vi.mock('../../lib/db', () => ({
  TranscriptSegments: { getByRecording: () => Promise.resolve(h.segments), assignSpeaker: vi.fn() },
  RecordingTracks: { getByRecording: () => Promise.resolve(h.tracks) },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => ({ pcs: [{ id: 'p1', character_name: 'Kael', player_name: 'Sam', is_active: true }] }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../../hooks/useRecordingPlayer', () => ({
  useRecordingPlayer: () => ({ audio: { current: null }, loading: false, playing: false, positionMs: null, pause: h.pause, playTrack: h.playTrack, playRecording: h.playRecording }),
}));

import { TranscriptModal } from './TranscriptModal';

const seg = (id: string, start: number, text: string, over: Partial<TranscriptSegment> = {}) => ({
  id, recording_id: 'r1', track_id: 't-table', start_ms: start, end_ms: start + 3000, speaker_label: 'A', pc_id: null, is_dm: false,
  text, dropped_as_echo: false, ...over,
}) as TranscriptSegment;
const recording = { id: 'r1', duration_ms: 3_600_000 } as SessionRecording;

beforeEach(() => {
  h.playTrack.mockReset().mockResolvedValue(undefined);
  h.playRecording.mockReset().mockResolvedValue(undefined);
  h.tracks = [{ id: 't-table', source: 'table' } as RecordingTrack, { id: 't-discord', source: 'discord' } as RecordingTrack];
  h.segments = [
    seg('s1', 12_000, 'We enter the drowned chapel.', { is_dm: true }),
    seg('s2', 64_000, 'I search the altar for traps.', { pc_id: 'p1', track_id: 't-discord' }),
    seg('s3', 90_000, 'The bell tolls once.', { is_dm: true }),
  ];
});

describe('TranscriptModal', () => {
  it('searches what was said, and who said it', async () => {
    render(<TranscriptModal recording={recording} onClose={vi.fn()} />);
    await screen.findByText('We enter the drowned chapel.');
    fireEvent.change(screen.getByLabelText('Search the transcript'), { target: { value: 'altar' } });
    expect(screen.getByText('1 of 3 lines')).toBeTruthy();
    expect(screen.queryByText('The bell tolls once.')).toBeNull();
    expect(screen.getByText('altar').tagName).toBe('MARK');
    fireEvent.change(screen.getByLabelText('Search the transcript'), { target: { value: 'kael' } });
    expect(screen.getByText('1 of 3 lines')).toBeTruthy();
  });

  it('says when nothing matches', async () => {
    render(<TranscriptModal recording={recording} onClose={vi.fn()} />);
    await screen.findByText('We enter the drowned chapel.');
    fireEvent.change(screen.getByLabelText('Search the transcript'), { target: { value: 'dragon' } });
    expect(screen.getByText('Nothing said matches “dragon”.')).toBeTruthy();
  });

  it('plays a line from its moment, on the track it was heard on', async () => {
    render(<TranscriptModal recording={recording} onClose={vi.fn()} />);
    await screen.findByText('I search the altar for traps.');
    fireEvent.click(screen.getByRole('button', { name: 'Play from 0:01:04' }));
    expect(h.playTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't-discord' }), 64_000);
  });

  it('stops playing when it closes', async () => {
    const { unmount } = render(<TranscriptModal recording={recording} onClose={vi.fn()} />);
    await screen.findByText('We enter the drowned chapel.');
    unmount();
    expect(h.pause).toHaveBeenCalled();
  });
});
