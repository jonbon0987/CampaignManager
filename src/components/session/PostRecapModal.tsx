// src/components/session/PostRecapModal.tsx
// -----------------------------------------------------------
// Posts the player recap to a Discord text channel: the DM reads and edits it
// first, it's queued in discord_posts, and the bot sends it.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { DiscordPosts } from '../../lib/db';
import type { DiscordPost, Session, SessionRecording } from '../../lib/database.types';
import { playerRecap, textChannels } from '../../lib/discord';
import { useDiscordBot } from '../../hooks/useDiscordBot';
import { limitFor } from '../../lib/fieldLimits';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LAST_TEXT = (campaignId: string) => `cm-discord-recap-channel:${campaignId}`;

export function PostRecapModal({ recording, session, onClose }: { recording: SessionRecording; session: Session; onClose: () => void }) {
  const { selectedCampaignId } = useCampaign();
  const toast = useToast();
  const bot = useDiscordBot();
  const channels = textChannels(bot.presence);
  const [channelId, setChannelId] = useState<string>(() => {
    try { return localStorage.getItem(LAST_TEXT(recording.campaign_id)) ?? ''; } catch { return ''; }
  });
  const [text, setText] = useState(() => playerRecap(session));
  const [posts, setPosts] = useState<DiscordPost[]>([]);
  const [sending, setSending] = useState(false);
  const pending = posts.some(p => p.status === 'pending');

  // While a post waits for the bot, check on it.
  useEffect(() => {
    let cancelled = false;
    const load = () => DiscordPosts.getByRecording(recording.id).then(p => { if (!cancelled) setPosts(p); }).catch(() => {});
    void load();
    const timer = pending ? setInterval(load, 3_000) : null;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [recording.id, pending]);

  const chosen = channels.find(c => c.id === channelId) ?? null;
  const send = async () => {
    if (!chosen || !selectedCampaignId) return;
    setSending(true);
    try {
      try { localStorage.setItem(LAST_TEXT(recording.campaign_id), chosen.id); } catch { /* not remembered */ }
      const post = await DiscordPosts.queue({ campaign_id: recording.campaign_id, recording_id: recording.id, channel_id: chosen.id, content: text.trim() });
      setPosts(prev => [post, ...prev]);
      toast(bot.online ? 'Sending to Discord…' : 'Queued. It’s sent when the bot is running.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const channelName = (id: string) => channels.find(c => c.id === id)?.label ?? 'a Discord channel';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Post the recap to Discord"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => void send()} disabled={!chosen || !text.trim() || sending}>
            <Send size={13} /> {sending ? 'Queuing…' : 'Post'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!bot.online && (
          <p className="text-sm" style={{ margin: 0, color: 'var(--warn)' }}>
            The Discord bot isn’t running. Start it with <span className="cm-kbd">npm run bot</span>{channels.length ? '; a post waits until then.' : ' to choose a channel.'}
          </p>
        )}
        <div className="as-fl">
          <label className="as-ll" htmlFor="recap-channel">Channel</label>
          <select id="recap-channel" className="as-select" value={chosen?.id ?? ''} onChange={e => setChannelId(e.target.value)}>
            <option value="">Choose a text channel…</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="as-fl">
          <label className="as-ll" htmlFor="recap-text">What players see</label>
          <textarea
            id="recap-text"
            className="as-input"
            rows={12}
            value={text}
            maxLength={limitFor('discord_posts', 'content')}
            onChange={e => setText(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            The recap, loot and what’s left open. Your DM notes are never included. Long recaps are split into several messages.
          </span>
        </div>
        {posts.length > 0 && (
          <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {posts.map(p => (
              <li key={p.id} className="flex items-center gap-2 flex-wrap text-xs" style={{ color: 'var(--ink-2)' }}>
                <Badge color={p.status === 'sent' ? 'green' : p.status === 'failed' ? 'red' : 'muted'}>{p.status === 'sent' ? 'Posted' : p.status === 'failed' ? 'Failed' : 'Waiting'}</Badge>
                <span>{channelName(p.channel_id)} · {new Date(p.sent_at ?? p.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {p.error && <span style={{ color: 'var(--red)' }}>{p.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
