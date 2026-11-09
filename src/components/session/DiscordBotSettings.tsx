// src/components/session/DiscordBotSettings.tsx
// -----------------------------------------------------------
// Settings → Discord: the bot's controls. It runs in the background (a login
// helper on this Mac, see bot/README.md), and these buttons sign it in and out
// of Discord and seat it in a voice channel, through a row it reads.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { voiceChannels } from '../../lib/discord';
import { useToast } from '../../context/ToastContext';
import { useDiscordBot, type BotStatus } from '../../hooks/useDiscordBot';
import type { DiscordTarget } from '../../lib/database.types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

const BADGE: Record<BotStatus, [string, 'muted' | 'yellow' | 'green' | 'red']> = {
  checking: ['Checking…', 'muted'],
  'not-running': ['Not running', 'muted'],
  offline: ['Signed out', 'muted'],
  connecting: ['Signing in…', 'yellow'],
  online: ['Online', 'green'],
  error: ['Couldn’t sign in', 'red'],
};

const INSTALL = 'npm run bot:install';

export function DiscordBotSettings() {
  const bot = useDiscordBot();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void getCurrentUser().then(u => setUserId(u?.id ?? null)).catch(() => {}); }, []);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast('Copied', 'success'), () => toast('Couldn’t copy; select it instead.', 'error'));
  };
  const ask = (patch: { online?: boolean; voice?: DiscordTarget | null }) => {
    void bot.setControl(patch).catch(e => toast(errorMessage(e), 'error'));
  };

  const servers = bot.presence?.guilds ?? [];
  const channels = voiceChannels(bot.presence);
  const seat = bot.presence?.voice ?? null;
  const wanted = bot.control?.voice ?? null;
  const [pick, setPick] = useState('');
  const picked = channels.find(c => c.channelId === (pick || wanted?.channelId || seat?.channelId)) ?? null;
  const seatLabel = seat ? channels.find(c => c.channelId === seat.channelId)?.label ?? `#${seat.channelName}` : null;
  const signedIn = bot.status === 'online';
  const signingIn = bot.status === 'connecting' || (bot.running && !!bot.control?.online && bot.status === 'offline');
  const [label, color] = signingIn ? BADGE.connecting : BADGE[bot.status];
  const envLines = `DISCORD_BOT_TOKEN=…\nSUPABASE_SERVICE_ROLE_KEY=…\nDM_LAIR_USER_ID=${userId ?? '…'}`;

  return (
    <div className="flex flex-col gap-3" style={{ paddingTop: 8 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={color}>{label}</Badge>
        {bot.presence?.bot_tag && (
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {bot.presence.bot_tag} · {servers.length ? servers.map(g => g.name).join(', ') : 'not in any server yet'}
          </span>
        )}
      </div>
      <p className="text-sm" style={{ margin: 0, color: 'var(--ink-2)' }}>
        For players who join over Discord. The bot sits in your voice channel while you record and keeps each person on their own track, so their lines are matched to the right character.
        It runs in the background on this computer; sign it in here when you play.
      </p>

      {bot.running && bot.presence?.detail && (
        <p className="text-sm" role="status" style={{ margin: 0, color: bot.status === 'error' ? 'var(--warn)' : 'var(--ink)' }}>{bot.presence.detail}</p>
      )}

      {bot.running && (
        <div className="dbot-controls">
          <div className="dbot-row">
            <span className="dbot-label">Discord</span>
            {signedIn || signingIn ? (
              <Button size="sm" variant="secondary" onClick={() => ask({ online: false })}>Sign out</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => ask({ online: true })}>Sign in</Button>
            )}
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {signedIn ? 'Online in your server.' : signingIn ? 'Signing in…' : 'Offline. A recording that uses Discord signs it in by itself.'}
            </span>
          </div>
          {signedIn && (
            <div className="dbot-row">
              <span className="dbot-label">Voice</span>
              {seat ? (
                <>
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>In {seatLabel}</span>
                  <Button size="sm" variant="secondary" onClick={() => { setPick(''); ask({ voice: null }); }}>Leave</Button>
                </>
              ) : wanted ? (
                <>
                  <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Joining #{wanted.channelName}…</span>
                  <Button size="sm" variant="secondary" onClick={() => ask({ voice: null })}>Cancel</Button>
                </>
              ) : (
                <>
                  <select className="as-select dbot-select" aria-label="Voice channel to join" value={picked?.channelId ?? ''}
                    onChange={e => setPick(e.target.value)}>
                    <option value="">Choose a voice channel…</option>
                    {channels.map(c => <option key={c.channelId} value={c.channelId}>{c.label}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" disabled={!picked}
                    onClick={() => picked && ask({ voice: { guildId: picked.guildId, channelId: picked.channelId, channelName: picked.channelName } })}>
                    Join
                  </Button>
                </>
              )}
            </div>
          )}
          {signedIn && (
            <p className="text-xs" style={{ margin: 0, color: 'var(--ink-3)' }}>
              It sits there muted and deafened, and records nothing until you start a recording. A recording takes over its voice connection while it runs.
            </p>
          )}
        </div>
      )}

      {bot.loaded && !bot.running && (
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ margin: 0, color: 'var(--ink)' }}>
            The bot isn’t running on this computer. Set it up once and it starts whenever you log in, ready for you to sign it in here:
          </p>
          <div className="flex items-center gap-2">
            <span className="cm-kbd">{INSTALL}</span>
            <Button size="xs" onClick={() => copy(INSTALL)} aria-label="Copy the install command"><Copy size={12} /></Button>
          </div>
        </div>
      )}

      {bot.loaded && !bot.running && (
        // A one-off for whoever runs the app's code, so it stays folded.
        <details className="set-dev">
          <summary className="text-sm" style={{ cursor: 'pointer', color: 'var(--ink-2)' }}>
            Developer setup: the first time on this computer
          </summary>
        <ol className="text-sm flex flex-col gap-2" style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--ink)', listStyle: 'decimal' }}>
          <li>Create a bot at the Discord Developer Portal (New Application → Bot), copy its token, and invite it to your server with View Channels, Connect and Send Messages.</li>
          <li>Copy your service role key from Supabase (Project Settings → API keys).</li>
          <li>
            Add these to <span className="cm-kbd">.env.local</span> in the project folder:
            <div className="flex items-start gap-2" style={{ marginTop: 6 }}>
              <pre className="cm-kbd" style={{ flex: 1, margin: 0, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{envLines}</pre>
              <Button size="xs" onClick={() => copy(envLines)} aria-label="Copy the settings"><Copy size={12} /></Button>
            </div>
          </li>
          <li>Install its packages with <span className="cm-kbd">npm --prefix bot install</span>, then run <span className="cm-kbd">{INSTALL}</span>. It starts now and at every login, and this page shows “Signed out” within a few seconds.</li>
        </ol>
        <p className="text-xs" style={{ margin: '8px 0 0', color: 'var(--ink-3)' }}>The full steps, and what to do if something goes wrong, are in <span className="cm-kbd">bot/README.md</span>.</p>
        </details>
      )}
      <p className="text-xs" style={{ margin: 0, color: 'var(--ink-3)' }}>
        Only people you link to a character whose player has agreed to recording (or link as the DM) are recorded. The bot posts a notice in the channel when recording starts and stops.
      </p>
    </div>
  );
}
