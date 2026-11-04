// The one empty state: a glyph, a sentence on what goes here, and the button
// that adds the first one. Lists show it across both panes when they have
// nothing in them (ListDetail's `empty`); a page can show it on its own.

import { Button } from './Button';

export interface EmptyStateProps {
  glyph?: string;
  /** What goes here and why: "No items yet. Magic items, treasure and gear…" */
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ glyph = '❧', text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="cm-es">
      <span className="cm-es-glyph" aria-hidden>{glyph}</span>
      <p className="cm-es-text">{text}</p>
      {actionLabel && onAction && <Button variant="primary" size="sm" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
