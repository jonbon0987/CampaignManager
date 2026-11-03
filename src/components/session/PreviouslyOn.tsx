// "Previously on…": what to read to the table as a session opens. The latest
// recap as read-aloud text, where the party stopped, and what was left open.
// Shown on Home before the next session, and first in Play's Scene tab.

import { useState } from 'react';
import { Button } from '../ui/Button';
import { ReadAloud } from '../ui/ReadAloudBlock';
import { clip, previouslyOn, sessionName, sessionRange } from '../../lib/sessionLifecycle';
import type { Session } from '../../lib/database.types';

const SHORT = 700;

export function PreviouslyOn({ sessions, before, large, readLabel = 'Previously on…', onOpenSession }: {
  sessions: Session[];
  /** The read-aloud box's label; Play titles the section itself, so its box says "Read aloud". */
  readLabel?: string;
  /** The session about to be played; the recap comes from those before it. */
  before?: number;
  large?: boolean;
  onOpenSession: (id: string) => void;
}) {
  const [full, setFull] = useState(false);
  const p = previouslyOn(sessions, before);
  if (!p) return null;

  const long = p.recap.length > SHORT;
  const text = full || !long ? p.recap : clip(p.recap, SHORT);
  const missing = p.unrecapped.at(-1);

  return (
    <section className="po" aria-label="Previously on">
      {p.recap ? (
        <>
          <ReadAloud text={text} large={large} label={readLabel} />
          <div className="po-from">
            From the recap of{' '}
            <Button variant="link" onClick={() => onOpenSession(p.recapFrom!.id)}>{sessionName(p.recapFrom!)}</Button>
            {long && <> · <Button variant="link" onClick={() => setFull(f => !f)}>{full ? 'Show less' : 'Read all of it'}</Button></>}
          </div>
        </>
      ) : (
        <p className="po-empty">No recap written yet, so there's nothing to read back.</p>
      )}

      {p.stopped && (
        <div className="po-part">
          <span className="po-label">Where you stopped</span>
          <p className="po-text">{p.stopped}</p>
        </div>
      )}

      {p.leftOpen.length > 0 && (
        <div className="po-part">
          <span className="po-label">Left open in {sessionName(p.last)}</span>
          <ul className="po-list">
            {p.leftOpen.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      {missing && (
        <p className="po-missing">
          {sessionRange(p.unrecapped)} {p.unrecapped.length === 1 ? 'has' : 'have'} no recap yet.{' '}
          <Button variant="link" onClick={() => onOpenSession(missing.id)}>{p.unrecapped.length === 1 ? 'Write it' : `Write Session ${missing.session_number}'s`}</Button>
        </p>
      )}
    </section>
  );
}
