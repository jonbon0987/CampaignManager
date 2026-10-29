// src/components/session/DiscordVoice.tsx
// -----------------------------------------------------------
// The Discord side of a recording: picking the voice channel the bot records,
// matching the people in it to player characters (or the DM), and, while
// recording, what the bot is doing. Only someone linked to a player who has
// agreed to recording, or linked as the DM, is recorded.
// -----------------------------------------------------------

import { useEffect, useEffectEvent, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { SpeakerLinks } from '../../lib/db';
import type { DiscordMember, PlayerConsent, SpeakerLink } from '../../lib/database.types';
import { Badge } from '../ui/Badge';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NOT_RECORDED = '';
const AS_DM = 'dm';

// --------------- Who's in the channel ---------------

/**
 * The people in a voice channel, each with who they play. Changing it saves
 * the link for this campaign, so it's remembered next session.
 */
export function DiscordMembers({ members, consents, onLinksChange }: {
  members: DiscordMember[];
  consents: PlayerConsent[] | null;
  onLinksChange?: (links: SpeakerLink[]) => void;
}) {
  const { pcs, selectedCampaignId } = useCampaign();
  const toast = useToast();
  const [links, setLinks] = useState<SpeakerLink[] | null>(null);
  const people = members.filter(m => !m.bot);

  const setAll = (next: SpeakerLink[]) => { setLinks(next); onLinksChange?.(next); };
  const loaded = useEffectEvent((next: SpeakerLink[]) => { setLinks(next); onLinksChange?.(next); });

  useEffect(() => {
    if (!selectedCampaignId) return;
    SpeakerLinks.getAll(selectedCampaignId).then(loaded).catch(() => loaded([]));
  }, [selectedCampaignId]);

  const agreed = (pcId: string | null) => !!pcId && !!consents?.some(c => c.pc_id === pcId && !c.revoked_at);

  const link = async (m: DiscordMember, value: string) => {
    if (!selectedCampaignId || !links) return;
    const existing = links.find(l => l.discord_user_id === m.id);
    try {
      if (value === NOT_RECORDED) {
        if (existing) await SpeakerLinks.delete(existing.id);
        setAll(links.filter(l => l.discord_user_id !== m.id));
      } else {
        const saved = await SpeakerLinks.save({
          campaign_id: selectedCampaignId, discord_user_id: m.id, discord_username: m.name.slice(0, 120),
          pc_id: value === AS_DM ? null : value, is_dm: value === AS_DM,
        });
        setAll([...links.filter(l => l.discord_user_id !== m.id), saved]);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (people.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>Nobody is in this channel yet. People appear here as they join.</p>;
  }

  return (
    <ul className="flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {people.map(m => {
        const l = links?.find(x => x.discord_user_id === m.id);
        const value = !l ? NOT_RECORDED : l.is_dm ? AS_DM : l.pc_id ?? NOT_RECORDED;
        const status = !l ? { text: 'Not recorded', color: 'var(--ink-3)' }
          : l.is_dm ? { text: 'Recorded as the DM', color: 'var(--success)' }
          : agreed(l.pc_id) ? { text: 'Recorded', color: 'var(--success)' }
          : { text: 'Not recorded until they agree', color: 'var(--warn)' };
        return (
          <li key={m.id} className="flex items-center gap-3 flex-wrap" style={{ padding: '7px 0', borderBottom: '1px solid var(--rule-soft)' }}>
            <span style={{ flex: '1 1 140px', fontWeight: 500, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
            <select
              className="as-select"
              style={{ flex: '0 1 200px' }}
              aria-label={`Who ${m.name} plays`}
              value={value}
              disabled={links === null}
              onChange={e => void link(m, e.target.value)}
            >
              <option value={NOT_RECORDED}>Don’t record</option>
              <option value={AS_DM}>The DM</option>
              {pcs.map(pc => <option key={pc.id} value={pc.id}>{pc.character_name}{pc.player_name ? ` (${pc.player_name})` : ''}</option>)}
            </select>
            <span className="text-xs" style={{ color: status.color, flex: '0 0 auto' }}>{status.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

// --------------- While recording ---------------

const STATE_BADGE: Record<string, { label: string; color: 'gold' | 'green' | 'red' | 'muted' | 'blue' }> = {
  connecting: { label: 'Joining', color: 'muted' },
  recording: { label: 'On Discord', color: 'blue' },
  finishing: { label: 'Saving', color: 'muted' },
  done: { label: 'Saved', color: 'green' },
  failed: { label: 'Discord failed', color: 'red' },
};

export function DiscordStateLine({ state, detail, botOnline }: { state: string | null | undefined; detail: string | null | undefined; botOnline: boolean }) {
  if (!state) return null;
  const badge = STATE_BADGE[state] ?? { label: state, color: 'muted' as const };
  const waiting = (state === 'connecting' || state === 'recording') && !botOnline;
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <Badge color={waiting ? 'yellow' : badge.color}>{waiting ? 'Bot not running' : badge.label}</Badge>
      <span style={{ color: state === 'failed' || waiting ? 'var(--warn)' : 'var(--ink-2)' }}>
        {waiting ? 'Start it with npm run bot. It joins as soon as it’s up.' : detail}
      </span>
    </div>
  );
}
