// ⌘. — jot a note without leaving the page. While a session is in play it
// goes in that session's table notes (and its recap); otherwise into the
// campaign's Ideas inbox. Replaces the Scratchpad, which kept notes in this
// browser only and shared them across every campaign. Its notes move into
// Ideas the first time a campaign opens.

import { useEffect, useRef, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';

export default function QuickNote({ open, onClose, onOpenInbox, onSessionNote, sessionNumber }: {
  open: boolean;
  onClose: () => void;
  onOpenInbox: () => void;
  /** Set while a session is in play: the note goes to its table notes. */
  onSessionNote?: (text: string) => void;
  sessionNumber?: number;
}) {
  const { upsertIdea } = useCampaign();
  const toast = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => ref.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const toSession = !!onSessionNote;

  const saveToSession = () => {
    const body = text.trim();
    if (!body || !onSessionNote) return;
    onSessionNote(body);
    setText('');
    toast(`Noted for Session ${sessionNumber}`, 'success');
    onClose();
  };

  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await upsertIdea({ text: body, tag: null, promoted_hook_id: null });
      setText('');
      toast('Saved to Ideas', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cm-note" role="dialog" aria-label="Quick note">
      <div className="cm-note-head">
        <span className="cm-note-title">✎ {toSession ? `Note for Session ${sessionNumber}` : 'Quick note'}</span>
        {/* eslint-disable-next-line no-restricted-syntax -- inline text link */}
        <button className="cm-note-link" onClick={() => { onOpenInbox(); onClose(); }}>Ideas inbox ›</button>
      </div>
      <textarea
        ref={ref}
        className="cm-note-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (toSession) saveToSession(); else void save(); } }}
        placeholder={toSession ? 'What just happened at the table…' : 'A spark, a twist, a name…'}
        rows={3}
        aria-label="Note"
      />
      <div className="cm-note-foot">
        <span className="cm-note-hint"><kbd className="cm-kbd">⌘↵</kbd> save · <kbd className="cm-kbd">Esc</kbd> close</span>
        {toSession && <Button variant="ghost" size="sm" onClick={() => void save()} disabled={!text.trim() || saving}>To Ideas</Button>}
        {toSession
          ? <Button variant="primary" size="sm" onClick={saveToSession} disabled={!text.trim()}>Add to session</Button>
          : <Button variant="primary" size="sm" onClick={() => void save()} disabled={!text.trim() || saving}>{saving ? 'Saving…' : 'Save to Ideas'}</Button>}
      </div>
    </div>
  );
}
