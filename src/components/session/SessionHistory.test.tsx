import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { makeSession } from '../../test/fixtures';
import type { EntitySessionEntry } from '../../lib/database.types';

const h = vi.hoisted(() => ({
  campaign: { value: null as Record<string, unknown> | null },
  toast: vi.fn(),
  getForEntity: vi.fn(),
  getRecording: vi.fn(),
  playRecording: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../lib/db', () => ({
  EntitySessionEntries: { getForEntity: h.getForEntity },
  SessionRecordings: { get: h.getRecording },
}));
vi.mock('../../hooks/useRecordingPlayer', () => ({
  useRecordingPlayer: () => ({ audio: { current: null }, loading: false, playRecording: h.playRecording }),
}));
vi.mock('./ChronicleView', () => ({
  ChronicleView: ({ recording }: { recording: { id: string } }) => <div role="dialog">Chronicle of {recording.id}</div>,
}));

import { SessionHistory } from './SessionHistory';

const entry = (over: Partial<EntitySessionEntry>): EntitySessionEntry => ({
  id: 'e', user_id: 'u', campaign_id: 'c1', session_id: 's1', recording_id: 'r1', entity_type: 'npc', entity_id: 'oren',
  text: 'Spoke.', source_ms: 130_000, source_quote: 'They had a key.', created_at: '2026-10-01', updated_at: '2026-10-01', ...over,
});

beforeEach(() => {
  h.campaign.value = makeCampaignContext({
    selectedCampaignId: 'c1',
    sessions: [makeSession({ id: 's6', session_number: 6 }), makeSession({ id: 's14', session_number: 14, session_date: '2026-10-27' })],
  });
  h.toast.mockReset();
  h.playRecording.mockReset().mockResolvedValue(undefined);
  h.getRecording.mockReset().mockResolvedValue({ id: 'r1' });
});

describe('SessionHistory', () => {
  it('lists this campaign’s sessions newest first, leaving out another campaign’s', async () => {
    h.getForEntity.mockResolvedValue([
      entry({ id: 'a', session_id: 's6', text: 'Refused entry.', recording_id: null, source_quote: null }),
      entry({ id: 'b', session_id: 's14', text: 'Admitted the key.' }),
      entry({ id: 'c', campaign_id: 'other', session_id: 's14', text: 'Elsewhere.' }),
    ]);
    render(<SessionHistory entityType="npc" entityId="oren" />);
    await screen.findByText('Admitted the key.');
    expect(h.getForEntity).toHaveBeenCalledWith('npc', 'oren');
    const sessions = screen.getAllByText(/^Session \d+$/).map(e => e.textContent);
    expect(sessions).toEqual(['Session 14', 'Session 6']);
    expect(screen.queryByText('Elsewhere.')).toBeNull();
    // Only the recorded entry offers its chronicle.
    expect(screen.getAllByRole('button', { name: 'See chronicle' })).toHaveLength(1);
  });

  it('plays the line from the recording, and opens the chronicle', async () => {
    h.getForEntity.mockResolvedValue([entry({ session_id: 's14' })]);
    render(<SessionHistory entityType="npc" entityId="oren" />);
    fireEvent.click(await screen.findByRole('button', { name: /0:02:10/ }));
    expect(h.playRecording).toHaveBeenCalledWith('r1', 130_000);
    fireEvent.click(screen.getByRole('button', { name: 'See chronicle' }));
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toBe('Chronicle of r1'));
  });

  it('says what will fill it when there’s nothing yet', async () => {
    h.getForEntity.mockResolvedValue([]);
    render(<SessionHistory entityType="location" entityId="x" />);
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
  });
});
