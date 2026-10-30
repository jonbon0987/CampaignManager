// ⌘. — jot a note into the campaign's Ideas inbox without leaving the page.
// Replaces the Scratchpad, which kept notes in this browser only and shared
// them across every campaign. Its notes move into Ideas the first time a
// campaign opens.

import { useEffect, useRef, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';

export default function QuickNote({ open, onClose, onOpenInbox }: { open: boolean; onClose: () => void; onOpenInbox: () => void }) {
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
        <span className="cm-note-title">✎ Quick note</span>
        {/* eslint-disable-next-line no-restricted-syntax -- inline text link */}
        <button className="cm-note-link" onClick={() => { onOpenInbox(); onClose(); }}>Ideas inbox ›</button>
      </div>
      <textarea
        ref={ref}
        className="cm-note-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }}
        placeholder="A spark, a twist, a name…"
        rows={3}
        aria-label="Note"
      />
      <div className="cm-note-foot">
        <span className="cm-note-hint"><kbd className="cm-kbd">⌘↵</kbd> save · <kbd className="cm-kbd">Esc</kbd> close</span>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={!text.trim() || saving}>{saving ? 'Saving…' : 'Save to Ideas'}</Button>
      </div>
    </div>
  );
}
