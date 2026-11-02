// Home's "Player page" card: make the page, copy its link, see what's on it,
// turn it off, or replace the link. What's on it is switched item by item, on
// the records themselves.

import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePlayerShares, type PlayerSharesValue } from '../../context/playerShares';
import { useToast } from '../../context/ToastContext';
import { describeShared, playerPageUrl } from '../../lib/playerPage';
import { Button } from '../ui/Button';

export function PlayerPageCard() {
  const shares = usePlayerShares();
  return shares?.loaded ? <Card shares={shares} /> : null;
}

function Card({ shares }: { shares: PlayerSharesValue }) {
  const { sessions, npcs, locations, lore } = useCampaign();
  const toast = useToast();
  const confirm = useConfirm();
  const { page } = shares;

  // Count only what's still in the campaign: a deleted record leaves its switch behind.
  const present = (ids: string[], list: { id: string }[]) => ids.filter(id => list.some(x => x.id === id)).length;
  const summary = describeShared({
    session: present(shares.sharedIds('session'), sessions),
    handout: shares.sharedIds('handout').length,
    npc: present(shares.sharedIds('npc'), npcs),
    location: present(shares.sharedIds('location'), locations),
    lore: present(shares.sharedIds('lore'), lore.filter(e => !e.dm_only)),
  });
  const url = page ? playerPageUrl(page.token) : '';

  const copy = () => navigator.clipboard.writeText(url)
    .then(() => toast('Link copied', 'success'))
    .catch(() => toast('Couldn’t copy it. Select the link and copy it yourself.', 'error'));

  const renew = async () => {
    if (await confirm({ title: 'Make a new link?', message: 'The old link stops working. Give the table the new one.', confirmLabel: 'New link' })) {
      await shares.issueLink();
    }
  };

  return (
    <section className="ov-share" aria-label="Player page">
      <div className="ov-share-head">
        <span className="ov-card-title">Player page</span>
        {page && <span className={`ov-share-state${page.enabled ? ' is-on' : ''}`}>{page.enabled ? 'On' : 'Off'}</span>}
      </div>

      {!page ? (
        <>
          <p className="ov-card-sub">
            A read-only page for your players, with no sign-in. It shows the party, and the recaps, handouts, people,
            places and lore you switch on. Notes and secrets never appear on it.
          </p>
          <div className="ov-share-actions">
            <Button size="sm" variant="primary" onClick={() => void shares.issueLink()}>Make a player page</Button>
          </div>
        </>
      ) : (
        <>
          {page.enabled ? (
            <div className="ov-share-link">
              <input className="as-input" readOnly value={url} aria-label="Player page link" onFocus={e => e.currentTarget.select()} />
              <Button size="sm" variant="secondary" onClick={() => void copy()}>Copy link</Button>
              <a className="ov-share-open" href={url} target="_blank" rel="noopener noreferrer">Open ↗</a>
            </div>
          ) : (
            <p className="ov-card-sub">Turned off. The link shows players nothing until you turn it back on.</p>
          )}
          <p className="ov-card-sub">
            {page.enabled ? 'Showing the party' : 'When it’s on, it shows the party'}
            {summary
              ? `, and ${summary}.`
              : '. Use “Hidden from players” on a recap, handout, NPC, place or lore entry to add it.'}
          </p>
          <div className="ov-share-actions">
            {page.enabled
              ? <Button size="xs" variant="ghost" onClick={() => void shares.setEnabled(false)}>Turn off</Button>
              : <Button size="xs" variant="secondary" onClick={() => void shares.setEnabled(true)}>Turn on</Button>}
            <Button size="xs" variant="ghost" onClick={() => void renew()}>New link</Button>
          </div>
        </>
      )}
    </section>
  );
}
