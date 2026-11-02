// "Recently deleted": everything deleted in the last 30 days, newest first.
// Restore puts a record back with everything its delete took along (a module's
// parts and scenes, a session's recordings); "Delete for good" forgets it now.
// Opening the list first forgets whatever is past 30 days.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useWorld } from '../../context/WorldContext';
import { Trash } from '../../lib/db';
import { announceRestored, deletedWhen, describeDeleted } from '../../lib/trash';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { DeletedItem } from '../../lib/database.types';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const idOf = (v: unknown) => (typeof v === 'string' ? v : null);

export function RecentlyDeleted({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { worlds, campaigns } = useWorld();
  const [items, setItems] = useState<DeletedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    Trash.list()
      .then(rows => setItems(rows.filter(r => describeDeleted(r)).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    Trash.purge().catch(() => {}).finally(load);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const where = (item: DeletedItem) => {
    const campaign = campaigns.find(c => c.id === idOf(item.data.campaign_id));
    if (campaign) return campaign.name;
    const world = worlds.find(w => w.id === idOf(item.data.world_id));
    return world ? world.name : null;
  };

  const drop = (batch: number) => setItems(prev => prev?.filter(i => i.batch !== batch) ?? prev);

  const restore = async (item: DeletedItem) => {
    setBusy(item.batch);
    try {
      await Trash.restore(item.batch);
      drop(item.batch);
      announceRestored();
      toast(`Restored “${describeDeleted(item)?.label}”`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const forget = async (item: DeletedItem) => {
    const label = describeDeleted(item)?.label;
    if (!(await confirm({ title: 'Delete for good?', message: `“${label}” can’t be restored after this.`, confirmLabel: 'Delete for good', danger: true }))) return;
    setBusy(item.batch);
    try {
      await Trash.purge(item.batch);
      drop(item.batch);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="rd-back" onClick={onClose}>
      <div className="rd" role="dialog" aria-modal="true" aria-labelledby="rd-title" onClick={e => e.stopPropagation()}>
        <div className="rd-head">
          <h2 className="rd-title" id="rd-title">Recently deleted</h2>
          <IconButton onClick={onClose} aria-label="Close" title="Close">✕</IconButton>
        </div>
        <p className="rd-note">Anything you delete is kept here for 30 days. Restoring brings back what it held too.</p>

        {failed ? (
          <p className="rd-empty">Couldn’t load what was deleted. Try again in a moment.</p>
        ) : items === null ? (
          <p className="rd-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rd-empty">Nothing deleted in the last 30 days.</p>
        ) : (
          <ul className="rd-list">
            {items.map(item => {
              const { noun, label } = describeDeleted(item)!;
              const place = where(item);
              return (
                <li key={item.batch} className="rd-row">
                  <div className="rd-text">
                    <div className="rd-name"><span className="rd-kind">{noun}</span>{label}</div>
                    <div className="rd-meta">
                      {[place, `deleted ${deletedWhen(item.deleted_at)}`, item.extra > 0 ? `${item.extra} more record${item.extra === 1 ? '' : 's'} with it` : null]
                        .filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="rd-actions">
                    <Button size="xs" variant="secondary" onClick={() => void restore(item)} disabled={busy !== null}>
                      {busy === item.batch ? 'Working…' : 'Restore'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => void forget(item)} disabled={busy !== null}>Delete for good</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
