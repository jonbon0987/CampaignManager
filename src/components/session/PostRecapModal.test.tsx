import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeSession } from '../../test/fixtures';
import type { SessionRecording } from '../../lib/database.types';

const h = vi.hoisted(() => ({ queue: vi.fn(), toast: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => ({ selectedCampaignId: 'c1' }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../lib/db', () => ({ DiscordPosts: { queue: h.queue, getByRecording: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../hooks/useDiscordBot', () => ({ useDiscordBot: () => ({ online: true, presence: null }) }));
vi.mock('../../lib/discord', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/discord')>()),
  textChannels: () => [{ id: 'ch1', label: '#recaps' }],
}));
vi.mock('../../lib/fieldLimits', () => ({ limitFor: () => 40 }));

import { PostRecapModal } from './PostRecapModal';

const recording = { id: 'r1', campaign_id: 'c1' } as SessionRecording;
const session = makeSession({ id: 's4', session_number: 4 });

beforeEach(() => {
  h.queue.mockReset().mockImplementation(async (p: { content: string }) => ({ id: p.content, status: 'pending', channel_id: 'ch1', created_at: '2026-11-22' }));
  h.toast.mockReset();
});

describe('PostRecapModal', () => {
  it('posts a long recap as several posts, in order, split between scenes', async () => {
    const text = '### One\n\n- first scene here\n\n### Two\n\n- second scene here';
    render(<PostRecapModal recording={recording} session={session} text={text} title="Post the player recap to Discord" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Post the player recap to Discord' })).toBeTruthy();
    expect(screen.getByText(/This one goes as 2 posts/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'ch1' } });
    fireEvent.click(screen.getByRole('button', { name: /Post/ }));
    await waitFor(() => expect(h.queue).toHaveBeenCalledTimes(2));
    expect(h.queue.mock.calls.map(c => c[0].content)).toEqual(['### One\n\n- first scene here', '### Two\n\n- second scene here']);
  });
});
