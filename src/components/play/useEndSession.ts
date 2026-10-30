import { useCallback } from 'react';
import { usePlay } from '../../context/PlayContext';
import { useConfirm } from '../../context/ConfirmContext';
import { sessionName } from '../../lib/sessionLifecycle';
import type { Tab } from '../../App';

/**
 * Ends the live session after a check, then opens it (on its recap). Used by
 * the agenda strip, the sidebar, Home and ⌘K, so ending works the same from each.
 */
export function useEndSession(openRecord: (tab: Tab, id: string) => void): () => Promise<void> {
  const { live, end } = usePlay();
  const confirm = useConfirm();
  return useCallback(async () => {
    if (!live) return;
    const ok = await confirm({
      title: `End ${sessionName(live)}?`,
      message: 'It’s marked played and opens on its recap. A recording running for it stops and is saved.',
      confirmLabel: 'End session',
    });
    if (!ok) return;
    try {
      const done = await end();
      if (done) openRecord('sessions', done.id);
    } catch {
      // The failed save has shown its toast; the session stays live.
    }
  }, [live, end, confirm, openRecord]);
}
