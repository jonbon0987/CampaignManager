import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeSession } from '../../test/fixtures';
import type { SessionRecording } from '../../lib/database.types';

const h = vi.hoisted(() => ({ queue: vi.fn(), toast: vi.fn(), saved: { value: null as unknown }, online: { value: true } }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => ({ selectedCampaignId: 'c1', selectedCampaign: { id: 'c1', discord_post_channel: h.saved.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../lib/db', () => ({ DiscordPosts: { queue: h.queue, getByRecording: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../hooks/useDiscordBot', () => ({ useDiscordBot: () => ({ online: h.online.value, presence: null, running: true, status: h.online.value ? 'online' : 'offline' }) }));
vi.mock('./DiscordVoice', () => ({ BotNotReady: () => null }));
vi.mock('../../lib/discord', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/discord')>()),
  textChannels: () => (h.online.value ? [{ id: 'ch1', label: 'The Table · #recaps' }, { id: 'ch2', label: 'The Table · #session-notes' }] : []),
}));
vi.mock('../../lib/fieldLimits', () => ({ limitFor: () => 40 }));

import { PostRecapModal } from './PostRecapModal';

const recording = { id: 'r1', campaign_id: 'c1' } as SessionRecording;
const session = makeSession({ id: 's4', session_number: 4 });

beforeEach(() => {
  h.saved.value = null;
  h.online.value = true;
  try { localStorage.clear(); } catch { /* none */ }
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

  describe('with a posts channel set for the campaign', () => {
    beforeEach(() => { h.saved.value = { guildId: 'g1', channelId: 'ch2', channelName: 'session-notes' }; });

    it('starts on it', () => {
      render(<PostRecapModal recording={recording} session={session} text="Hello" onClose={vi.fn()} />);
      expect((screen.getByLabelText('Channel') as HTMLSelectElement).value).toBe('ch2');
      expect(screen.getByText(/This campaign’s posts channel/)).toBeTruthy();
    });

    it('sends just this post somewhere else, without changing it', async () => {
      render(<PostRecapModal recording={recording} session={session} text="Hello" onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'ch1' } });
      expect(screen.getByText('Just this post. The campaign’s posts channel is #session-notes (Settings → Discord).')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Post/ }));
      await waitFor(() => expect(h.queue).toHaveBeenCalledWith(expect.objectContaining({ channel_id: 'ch1' })));
      expect(localStorage.getItem('cm-discord-recap-channel:c1')).toBeNull();
    });

    it('queues for it while the bot is signed out', async () => {
      h.online.value = false;
      render(<PostRecapModal recording={recording} session={session} text="Hello" onClose={vi.fn()} />);
      expect((screen.getByLabelText('Channel') as HTMLSelectElement).value).toBe('ch2');
      fireEvent.click(screen.getByRole('button', { name: /Post/ }));
      await waitFor(() => expect(h.queue).toHaveBeenCalledWith(expect.objectContaining({ channel_id: 'ch2', content: 'Hello' })));
    });
  });
});
