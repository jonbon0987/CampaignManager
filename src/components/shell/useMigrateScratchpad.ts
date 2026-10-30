// Moves the old Scratchpad's notes (kept in this browser only, shared by every
// campaign) into the Inbox of the first campaign opened, then forgets them.

import { useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';

const OLD_SCRATCH_KEY = 'cm-scratch';

export function useMigrateScratchpad() {
  const { selectedCampaignId, upsertIdea } = useCampaign();
  const toast = useToast();
  useEffect(() => {
    if (!selectedCampaignId) return;
    let notes: { text?: string }[] = [];
    try { notes = JSON.parse(localStorage.getItem(OLD_SCRATCH_KEY) || '[]'); } catch { return; }
    const texts = (Array.isArray(notes) ? notes : []).map(n => n?.text?.trim()).filter((t): t is string => !!t);
    try { localStorage.removeItem(OLD_SCRATCH_KEY); } catch { return; }
    if (!texts.length) return;
    // Oldest first, so the inbox keeps their order.
    void (async () => {
      for (const text of texts.reverse()) await upsertIdea({ text, tag: 'scratchpad', promoted_hook_id: null });
      toast(`Moved ${texts.length} Scratchpad note${texts.length === 1 ? '' : 's'} into Ideas`, 'success');
    })();
  }, [selectedCampaignId, upsertIdea, toast]);
}
