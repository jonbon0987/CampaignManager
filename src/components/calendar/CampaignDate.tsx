// Where the campaign is in its world's time: a card on Home, and a chip in the
// Play strip that opens the same controls.

import { useEffect, useRef, useState } from 'react';
import { useCampaignDate } from '../../hooks/useCampaignDate';
import { formatWorldDate } from '../../lib/calendar';
import { WorldDateControls } from './WorldDateControls';

/** Home's "In the world" card. */
export function CampaignDateCard() {
  const { date, setDate, months, suffix, worldYear } = useCampaignDate();
  return (
    <section className="ov-wd" aria-label="In the world">
      <div className="ov-card-title">In the world</div>
      {!date && (
        <p className="ov-card-sub">Set where the campaign stands in the world’s calendar. Sessions note it as they start and end.</p>
      )}
      <WorldDateControls date={date} months={months} suffix={suffix} defaultYear={worldYear} onChange={setDate} />
    </section>
  );
}

/** The date in the Play strip; a click opens the controls to move time on. */
export function PlayDate() {
  const { date, setDate, months, suffix, worldYear } = useCampaignDate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="ps-date-wrap" ref={box}>
      {/* eslint-disable-next-line no-restricted-syntax -- the in-world date, styled with the strip */}
      <button type="button" className="ps-date" onClick={() => setOpen(o => !o)} aria-expanded={open} title="Move time on">
        ☽ {date ? formatWorldDate(date, months, suffix) : 'Set the date'}
      </button>
      {open && (
        <div className="ps-date-pop" role="dialog" aria-label="In-world date">
          <WorldDateControls date={date} months={months} suffix={suffix} defaultYear={worldYear} onChange={setDate} />
        </div>
      )}
    </div>
  );
}
