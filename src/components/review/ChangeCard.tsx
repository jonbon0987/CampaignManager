// One proposed change to the campaign or world, as every review shows it: the
// assistant's staged changes and a recording's chronicle alike. The caller
// maps its own proposal to a ChangeView and puts its own controls (include,
// accept, skip, edit) in `actions`; the card is the shared look.

import type { ReactNode } from 'react';

/** What a change does to its record. */
export type ChangeTone = 'new' | 'update' | 'note' | 'delete';
/** Where a change stands. Accepted ones are written when the DM applies. */
export type ChangeState = 'pending' | 'accepted' | 'skipped' | 'applied' | 'failed';

const TONE_LABEL: Record<ChangeTone, string> = { new: 'New', update: 'Update', note: 'Add note', delete: 'Delete' };

export interface ChangeView {
  /** The record's kind, as the rest of the app shows it. */
  glyph: string;
  color: string;
  kindLabel: string;
  name: string;
  tone: ChangeTone;
  /** e.g. "Adds to description". */
  note?: string;
  /** Field by field: what it was (if anything) and what it becomes. */
  changes: { label: string; before?: string | null; after: string; added?: boolean }[];
  /** Longer text the change writes. */
  body?: { label: string; text: string } | null;
  tags?: string[];
  /** The line it adds to the record's Session History. */
  history?: string | null;
}

export function ChangeCard({
  view, state, why, source, actions, meta, edited, selected, onSelect, open = true, onToggleOpen, children,
}: {
  view: ChangeView;
  state: ChangeState;
  /** Why it's proposed (the assistant's reasoning). */
  why?: string;
  /** Where it was heard (a recording's quote, with its play button). */
  source?: ReactNode;
  /** The caller's controls: include, accept, skip, edit. */
  actions?: ReactNode;
  /** Beside the name, e.g. the assistant's confidence. */
  meta?: ReactNode;
  edited?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Collapsible cards (the narrow assistant rail) pass open and onToggleOpen. */
  open?: boolean;
  onToggleOpen?: () => void;
  /** Replaces the body, e.g. with an edit form. */
  children?: ReactNode;
}) {
  const empty = !view.changes.length && !view.body && !view.history && view.tone !== 'delete';
  return (
    <article className={`rv-card is-${state}${selected ? ' is-selected' : ''}${open ? '' : ' is-closed'}`} onClick={onSelect}>
      <div className={`rv-head${onToggleOpen ? ' is-toggle' : ''}`} onClick={onToggleOpen}>
        <span className="rv-glyph" style={{ color: view.color }} aria-hidden>{view.glyph}</span>
        <span className="rv-title">
          <span className="rv-name" style={{ color: view.color }}>{view.name}</span>
          <span className="rv-sub">
            <span className={`rv-tone is-${view.tone}`}>{TONE_LABEL[view.tone]}</span>
            {view.kindLabel}{view.note ? ` · ${view.note}` : ''}
            {edited && <span className="rv-flag">✎ Edited</span>}
            {state === 'applied' && <span className="rv-flag is-applied">✓ Applied</span>}
            {state === 'failed' && <span className="rv-flag is-failed">Failed</span>}
          </span>
        </span>
        {meta}
        {actions && <span className="rv-actions" onClick={e => e.stopPropagation()}>{actions}</span>}
        {onToggleOpen && <span className="rv-chev" aria-hidden>▸</span>}
      </div>

      {open && (
        <div className="rv-body">
          {children ?? (
            <>
              {why && <p className="rv-why"><span aria-hidden>✦</span>{why}</p>}
              {view.tone === 'delete' && <p className="rv-delete">This record will be deleted.</p>}
              {view.changes.map((c, i) => (
                <div key={i} className="rv-field">
                  <span className="rv-label">{c.label}</span>
                  <span className="rv-diff">
                    {c.before && <span className="rv-before">{c.before}</span>}
                    {c.before && <span className="rv-arrow" aria-hidden>→</span>}
                    <span className={`rv-after${c.added ? ' is-added' : ''}`}>{c.after}</span>
                  </span>
                </div>
              ))}
              {view.body && (
                <div className="rv-field">
                  <span className="rv-label">{view.body.label}</span>
                  <p className="rv-text">{view.body.text}</p>
                </div>
              )}
              {!!view.tags?.length && <div className="rv-tags">{view.tags.map(t => <span key={t} className="cm-tag">{t}</span>)}</div>}
              {view.history && <p className="rv-history"><span className="rv-label">History</span>{view.history}</p>}
              {empty && <p className="rv-empty">No field changes: the record already matches.</p>}
            </>
          )}
          {source}
        </div>
      )}
    </article>
  );
}
