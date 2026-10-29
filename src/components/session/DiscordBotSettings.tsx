// src/components/session/DiscordBotSettings.tsx
// -----------------------------------------------------------
// Settings → Discord: whether the bot is running, and how to set it up. The
// bot runs on the DM's own computer (bot/README.md has the full steps).
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import { useToast } from '../../context/ToastContext';
import { useDiscordBot } from '../../hooks/useDiscordBot';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function DiscordBotSettings() {
  const bot = useDiscordBot();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void getCurrentUser().then(u => setUserId(u?.id ?? null)).catch(() => {}); }, []);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast('Copied', 'success'), () => toast('Couldn’t copy; select it instead.', 'error'));
  };
  const servers = bot.presence?.guilds ?? [];
  const envLines = `DISCORD_BOT_TOKEN=…\nSUPABASE_SERVICE_ROLE_KEY=…\nDM_LAIR_USER_ID=${userId ?? '…'}`;

  return (
    <div className="flex flex-col gap-3" style={{ paddingTop: 8 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={bot.online ? 'green' : 'muted'}>{!bot.loaded ? 'Checking…' : bot.online ? 'Running' : 'Not running'}</Badge>
        {bot.presence && (
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {bot.presence.bot_tag} · {servers.length ? servers.map(g => g.name).join(', ') : 'not in any server yet'}
            {!bot.online && ` · last seen ${new Date(bot.presence.heartbeat_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
          </span>
        )}
      </div>
      <p className="text-sm" style={{ margin: 0, color: 'var(--ink-2)' }}>
        For players who join over Discord. The bot sits in your voice channel while you record and keeps each person on their own track, so their lines are matched to the right character.
        It runs on this computer while you play.
      </p>
      {!bot.online && (
        // Setup is a one-off, so it folds away once the bot has been seen.
        <details open={!bot.presence}>
          <summary className="text-sm" style={{ cursor: 'pointer', color: 'var(--gold)' }}>
            {bot.presence ? 'Set up the bot again' : 'Set up the bot (once)'}
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
          <li>Start it with <span className="cm-kbd">npm run bot</span>. This shows “Running” within a few seconds.</li>
        </ol>
        <p className="text-xs" style={{ margin: '8px 0 0', color: 'var(--ink-3)' }}>The full steps, and what to do if something goes wrong, are in <span className="cm-kbd">bot/README.md</span>.</p>
        </details>
      )}
      {!bot.online && bot.presence && (
        <p className="text-sm" style={{ margin: 0, color: 'var(--ink)' }}>
          Start it with <span className="cm-kbd">npm run bot</span> before you record.
        </p>
      )}
      <p className="text-xs" style={{ margin: 0, color: 'var(--ink-3)' }}>
        Only people you link to a character whose player has agreed to recording (or link as the DM) are recorded. The bot posts a notice in the channel when recording starts and stops.
      </p>
    </div>
  );
}
