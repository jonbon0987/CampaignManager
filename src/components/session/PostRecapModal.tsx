// src/components/session/PostRecapModal.tsx
// -----------------------------------------------------------
// Posts the player recap to a Discord text channel: the DM reads and edits it
// first, it's queued in discord_posts, and the bot sends it. A text longer
// than one post is queued as several, split between scenes, sent in order.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { DiscordPosts } from '../../lib/db';
import type { DiscordPost, Session, SessionRecording } from '../../lib/database.types';
import { playerRecap, textChannels } from '../../lib/discord';
import { splitRecap } from '../../lib/recording/playerRecap';
import { useDiscordBot } from '../../hooks/useDiscordBot';
import { limitFor } from '../../lib/fieldLimits';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { BotNotReady } from './DiscordVoice';
import { Select, Textarea } from '../ui/Input';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LAST_TEXT = (campaignId: string) => `cm-discord-recap-channel:${campaignId}`;

export function PostRecapModal({ recording, session, text: initialText, title = 'Post the recap to Discord', onClose }: {
  recording: SessionRecording;
  session: Session;
  /** What to post, to start with; the session's short recap, loot and what's left open when not given. */
  text?: string;
  title?: string;
  onClose: () => void;
}) {
  const { selectedCampaignId } = useCampaign();
  const toast = useToast();
  const bot = useDiscordBot();
  const channels = textChannels(bot.presence);
  const [channelId, setChannelId] = useState<string>(() => {
    try { return localStorage.getItem(LAST_TEXT(recording.campaign_id)) ?? ''; } catch { return ''; }
  });
  const [text, setText] = useState(() => initialText ?? playerRecap(session));
  const parts = splitRecap(text, limitFor('discord_posts', 'content') ?? 8000);
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
      // One at a time, so they're queued (and sent) in order.
      const queued: DiscordPost[] = [];
      for (const content of parts) {
        queued.push(await DiscordPosts.queue({ campaign_id: recording.campaign_id, recording_id: recording.id, channel_id: chosen.id, content }));
      }
      setPosts(prev => [...queued.reverse(), ...prev]);
      toast(bot.online ? 'Sending to Discord…' : 'Queued. It’s sent once the bot is signed in.', 'success');
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
      title={title}
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
        {!bot.online && <BotNotReady bot={bot} purpose={channels.length ? 'A post waits until it’s signed in.' : 'Sign it in to choose a channel.'} />}
        <div className="as-fl">
          <label className="as-ll" htmlFor="recap-channel">Channel</label>
          <Select look="inline" id="recap-channel" value={chosen?.id ?? ''} onChange={e => setChannelId(e.target.value)}>
            <option value="">Choose a text channel…</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        <div className="as-fl">
          <label className="as-ll" htmlFor="recap-text">What players see</label>
          <Textarea look="inline"
            id="recap-text"
            rows={12}
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {initialText ? 'Your DM notes are never included.' : 'The recap, loot and what’s left open. Your DM notes are never included.'} Long recaps are split into several messages.
            {parts.length > 1 ? ` This one goes as ${parts.length} posts.` : ''}
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
