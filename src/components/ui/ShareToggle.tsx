// The "Players can see" switch on anything a campaign can show its players:
// an NPC, place, lore entry, handout or session recap. Off until the DM turns
// it on. Outside a campaign there's nothing to share with, so it doesn't show.

import { Eye, EyeOff } from 'lucide-react';
import { usePlayerShares } from '../../context/playerShares';
import type { ShareKind } from '../../lib/database.types';

export function ShareToggle({ kind, id, what, compact, unavailable }: {
  kind: ShareKind;
  id: string;
  /** Names what's shared when it isn't the whole record: "the recap". */
  what?: string;
  /** Just the eye, for a small card. */
  compact?: boolean;
  /** Why this can't be shared, if it can't: "DM-only lore stays off the player page." */
  unavailable?: string;
}) {
  const shares = usePlayerShares();
  if (!shares) return null;
  const on = !unavailable && shares.isShared(kind, id);
  const label = on
    ? (what ? `Players can see ${what}` : 'Players can see')
    : (what ? `${what.replace(/^the /, '').replace(/^./, c => c.toUpperCase())} hidden from players` : 'Hidden from players');
  const title = unavailable
    ?? (on ? 'On the player page. Click to hide it.' : 'Only you can see this. Click to show it on the player page.');

  return (
    <button type="button" className={`share-tog${on ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}
      aria-pressed={on} aria-label={compact ? label : undefined} title={title} disabled={!!unavailable}
      onClick={() => void shares.setShared(kind, id, !on)}>
      {on ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
