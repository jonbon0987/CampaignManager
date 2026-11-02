// A session's in-world dates, under its title: "14–16 Mirtul 1492 DR · 2 days".
// Play stamps them as the session starts and ends; a session without them can
// take the campaign's date. Once dated, it can be posted to the world Timeline
// as a campaign event, and posting again updates that event.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { useToast } from '../../context/ToastContext';
import { useCampaignDate } from '../../hooks/useCampaignDate';
import { dateOf, daysBetween, daysLabel, formatSpan, formatWorldDate } from '../../lib/calendar';
import { plainText, sessionName } from '../../lib/sessionLifecycle';
import { Button } from '../ui/Button';
import type { Session } from '../../lib/database.types';

const DESC_MAX = 600;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SessionWorldDates({ session }: { session: Session }) {
  const { selectedCampaign, updateSession } = useCampaign();
  const { activeWorld, timeline, createTimelineEvent, upsertTimelineEvent } = useWorld();
  const { date: current, months, suffix } = useCampaignDate();
  const toast = useToast();
  const [posting, setPosting] = useState(false);

  const start = dateOf(session.world_start);
  const end = dateOf(session.world_end) ?? start;

  if (!start) {
    if (!current) return null;
    return (
      <div className="wd-session">
        <span className="as-ll">In the world</span>
        <Button variant="link" onClick={() => void updateSession(session.id, { world_start: current, world_end: current })}>
          Date it {formatWorldDate(current, months, suffix)}
        </Button>
      </div>
    );
  }

  const span = formatSpan(start, end, months, suffix);
  const passed = end ? daysBetween(start, end, months) : 0;
  const posted = !!session.timeline_event_id && timeline.some(e => e.id === session.timeline_event_id);

  const post = async () => {
    setPosting(true);
    try {
      const campaign = selectedCampaign?.title?.trim() || selectedCampaign?.name || 'Campaign';
      const summary = plainText(session.summary ?? '');
      const fields = {
        title: `${campaign}: ${sessionName(session)}`,
        desc: summary.length > DESC_MAX ? `${summary.slice(0, DESC_MAX - 1)}…` : summary,
        year: start.year,
        date: span,
        type: 'campaign' as const,
        era: activeWorld?.era ?? '',
        order: start.day,
      };
      if (posted) {
        await upsertTimelineEvent({ id: session.timeline_event_id!, ...fields });
        toast('Timeline event updated');
      } else {
        const id = await createTimelineEvent(fields);
        if (id) await updateSession(session.id, { timeline_event_id: id });
        toast('Added to the world timeline');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="wd-session">
      <span className="as-ll">In the world</span>
      <span className="wd-span">{span}{passed > 0 ? ` · ${daysLabel(passed)}` : ''}</span>
      {posted && <span className="wd-posted">On the world timeline</span>}
      <Button size="xs" variant="ghost" onClick={() => void post()} disabled={posting}>
        {posting ? 'Posting…' : posted ? 'Update timeline' : 'Add to the world timeline'}
      </Button>
    </div>
  );
}
