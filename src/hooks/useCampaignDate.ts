// The campaign's current in-world date, with its world's calendar to read it.
// A change shows at once and saves in order, so quick clicks of "+1 day" add
// up rather than racing each other.

import { useCallback, useRef, useState } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useWorld } from '../context/WorldContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_MONTHS, dateOf, yearSuffix, type WorldDate } from '../lib/calendar';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useCampaignDate() {
  const { selectedCampaign, updateCampaign } = useCampaign();
  const { activeWorld } = useWorld();
  const toast = useToast();
  const [pending, setPending] = useState<WorldDate | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<WorldDate | null>(null);

  const stored = dateOf(selectedCampaign?.world_date);
  const date = pending ?? stored;
  const campaignId = selectedCampaign?.id;

  const setDate = useCallback((next: WorldDate) => {
    if (!campaignId) return;
    setPending(next);
    latest.current = next;
    queue.current = queue.current
      .then(() => updateCampaign(campaignId, { world_date: next }))
      .catch(e => toast(errorMessage(e), 'error'))
      .finally(() => { if (latest.current === next) setPending(undefined); });
  }, [campaignId, updateCampaign, toast]);

  return {
    date,
    setDate,
    months: activeWorld?.calendarMonths ?? DEFAULT_MONTHS,
    suffix: yearSuffix(activeWorld?.calendar),
    /** The world's year, to start a campaign's first date from. */
    worldYear: activeWorld?.year ?? 1,
  };
}
