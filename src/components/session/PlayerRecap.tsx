// src/components/session/PlayerRecap.tsx
// -----------------------------------------------------------
// The session's player recap: a longer telling for the players, scene by
// scene, then the moments to remember, written from the recording
// (lib/recording/playerRecap). It arrives as a draft only the DM sees; the DM
// reads it, edits it, and publishes it to the player page, copies it,
// downloads it, or prints it.
//
// Its text and status are fields of the session form, so they autosave with
// the rest of the session (SessionNotes).
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChroniclePipelineMaybe } from '../../context/ChroniclePipelineContext';
import { usePlayerShares } from '../../context/playerShares';
import { useRecording } from '../../context/RecordingContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { SessionRecordings } from '../../lib/db';
import { saveFile } from '../../lib/saveFile';
import { refsToText } from '../../lib/discord';
import { refsToNames } from '../../lib/slashMarkdown';
import { formatSessionDate } from '../../lib/sessionLifecycle';
import { limitFor } from '../../lib/fieldLimits';
import { PLAYER_RECAP_DISCORD } from '../../lib/features';
import { recapFileName, recapHeading, recapPlainText } from '../../lib/recording/playerRecap';
import type { PlayerRecapStatus, Session, SessionRecording } from '../../lib/database.types';
import { Button } from '../ui/Button';
import { MarkdownContent } from '../ui/MarkdownContent';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SlashField } from '../ui/SlashField';
import { PostRecapModal } from './PostRecapModal';
import './session.css';

/** A recording the recap can be written from: transcribed, with or without its chronicle. */
const TRANSCRIBED = new Set(['transcribed', 'writing', 'ready', 'applied']);

export function PlayerRecap({ session, value, status, onChange, onStatus }: {
  session: Session;
  value: string | null;
  status: PlayerRecapStatus | null;
  onChange: (text: string | null) => void;
  onStatus: (status: PlayerRecapStatus | null) => void;
}) {
  const pipeline = useChroniclePipelineMaybe();
  const shares = usePlayerShares();
  const { version } = useRecording();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [recordings, setRecordings] = useState<SessionRecording[]>([]);

  useEffect(() => {
    let cancelled = false;
    SessionRecordings.getBySession(session.id)
      .then(rows => { if (!cancelled) setRecordings(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session.id, version]);

  // The newest recording with a transcript.
  const source = recordings.find(r => r.status === 'review' || r.status === 'applied'
    || TRANSCRIBED.has(pipeline.entryFor(r.id)?.stage ?? '')) ?? null;
  const state = pipeline.recapFor(session.id);
  const writing = !!state?.writing;
  const text = value?.trim() ? value : null;
  const published = status === 'published' && !!text;
  const heading = recapHeading(session);

  const write = async () => {
    if (!source) return;
    if (text && !(await confirm('Write the player recap again from the recording? It replaces this one, with any edits you made, and goes back to a draft.'))) return;
    setEditing(false);
    await pipeline.writeRecap(source);
  };

  const copy = () => {
    const plain = recapPlainText(refsToNames(text ?? ''), heading);
    void navigator.clipboard.writeText(plain).then(() => toast('Copied', 'success'), () => toast('Couldn’t copy. Download it instead.', 'error'));
  };

  const download = () => {
    const md = `# ${heading}\n\n${refsToNames(text ?? '')}\n`;
    saveFile(new Blob([md], { type: 'text/markdown;charset=utf-8' }), recapFileName(session, 'md'));
  };

  const publish = () => {
    onStatus('published');
    toast(shares?.page?.enabled === false ? 'Published. Turn the player page back on for players to see it.' : 'On the player page', 'success');
  };

  const noPage = !shares?.page;
  const menu = [
    { label: 'Download as Markdown', onClick: download },
    { label: 'Print or save as PDF', onClick: () => setPrinting(true) },
    ...(PLAYER_RECAP_DISCORD && source ? [{ label: 'Post to Discord', onClick: () => setPosting(true) }] : []),
    ...(source ? [{ label: 'Write it again from the recording', onClick: () => void write() }] : []),
  ];

  return (
    <div className="cm-section prc" aria-labelledby={`prc-${session.id}`}>
      <div className="cm-section-head prc-head">
        <span className="cm-section-title" id={`prc-${session.id}`}>Player recap</span>
        {text && (
          <span className={`prc-status${published ? ' is-published' : ''}`}>
            {published ? 'On the player page' : 'Draft · only you can see it'}
          </span>
        )}
        <div className="cm-section-rule" />
      </div>

      {writing && (
        <p className="prc-note" role="status">
          Writing the player recap from the recording… a minute or two. You can leave this page.
        </p>
      )}
      {state?.error && !writing && (
        <p className="prc-note is-error" role="alert">
          Couldn’t write the player recap: {state.error}{' '}
          {source && <Button variant="link" onClick={() => void write()}>Try again</Button>}
        </p>
      )}

      {!text && !writing && (
        <div className="prc-empty">
          <p>
            A longer telling of the session for your players, scene by scene, with a few lines quoted as they were said,
            and the moments to remember at the end. It’s written from the recording once it’s transcribed, and stays a
            draft until you publish it.
          </p>
          {source && <Button variant="secondary" size="sm" onClick={() => void write()}>Write it from the recording</Button>}
        </div>
      )}

      {text && (
        <>
          {editing ? (
            <SlashField
              value={value ?? ''}
              onChange={v => onChange(v || null)}
              maxLength={limitFor('sessions', 'player_recap')}
            />
          ) : (
            <MarkdownContent className="prc-text" text={text} />
          )}

          <div className="prc-actions">
            {published ? (
              <Button variant="secondary" size="sm" onClick={() => onStatus('draft')} disabled={writing}>Unpublish</Button>
            ) : (
              <Button variant="primary" size="sm" onClick={publish} disabled={writing || noPage}
                title={noPage ? 'Make the player page on the Overview first.' : undefined}>
                Publish to the player page
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setEditing(e => !e)} disabled={writing}>{editing ? 'Done editing' : 'Edit'}</Button>
            <Button variant="secondary" size="sm" onClick={copy}>Copy text</Button>
            <OverflowMenu items={menu} />
            {noPage && !published && <span className="prc-hint">Make the player page on the Overview to publish it there.</span>}
          </div>
        </>
      )}

      {printing && text && <RecapSheet session={session} text={text} onClose={() => setPrinting(false)} />}
      {posting && source && text && (
        <PostRecapModal
          recording={source}
          session={session}
          title="Post the player recap to Discord"
          text={`**${heading}**\n\n${refsToText(text)}`}
          onClose={() => setPosting(false)}
        />
      )}
    </div>
  );
}

/** The recap on a page of its own, to print or save as a PDF from the print dialog. */
function RecapSheet({ session, text, onClose }: { session: Session; text: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="print-root psh-back" role="dialog" aria-modal="true" aria-label="Player recap">
      <div className="psh-bar">
        <span className="psh-bar-title">Player recap · {recapHeading(session)}</span>
        <Button variant="primary" size="sm" onClick={() => window.print()}>Print or save as PDF</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <article className="psh prc-sheet">
        <header className="psh-head">
          <div className="psh-eyebrow">Session {session.session_number}{session.session_date ? ` · ${formatSessionDate(session.session_date)}` : ''}</div>
          <h1 className="psh-title">{session.title?.trim() || `Session ${session.session_number}`}</h1>
        </header>
        <MarkdownContent className="prc-sheet-text" text={refsToNames(text)} />
      </article>
    </div>,
    document.body,
  );
}
