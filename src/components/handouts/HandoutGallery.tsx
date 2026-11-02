// Handouts as thumbnails: click one to show it full-screen to the table.
// Editable on a scene (add, rename, remove, show to players); read-only in
// Play and Prep.

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useImageUrl } from '../../hooks/useImageUrl';
import { IMAGE_ACCEPT } from '../../lib/images';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Lightbox } from '../ui/Lightbox';
import { ShareToggle } from '../ui/ShareToggle';
import type { Handout } from '../../lib/database.types';

function HandoutCard({ h, onShow, onRename, onRemove, sharable }: {
  h: Handout;
  sharable?: boolean;
  onShow: (url: string) => void;
  onRename?: (title: string) => void;
  onRemove?: () => void;
}) {
  const url = useImageUrl(h.image_path);
  const [title, setTitle] = useState(h.title);
  return (
    <figure className="ho-card">
      {/* eslint-disable-next-line no-restricted-syntax -- the handout itself, shown full-screen */}
      <button type="button" className="ho-thumb" onClick={() => url && onShow(url)} aria-label={`Show ${h.title || 'the handout'}`} title="Show it full-screen">
        {url ? <img src={url} alt={h.title} /> : <span className="ho-loading">…</span>}
      </button>
      <figcaption className="ho-cap">
        {onRename
          ? <input className="ho-title" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => onRename(title.trim())}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="Untitled handout" maxLength={120} aria-label="Handout title" />
          : <span className="ho-title-text">{h.title || 'Untitled handout'}</span>}
        {sharable && <ShareToggle kind="handout" id={h.id} what={h.title || 'this handout'} compact />}
        {onRemove && (
          <IconButton onClick={onRemove} aria-label={`Remove ${h.title || 'the handout'}`} title="Remove" style={{ width: 22, height: 22 }}>
            <X size={12} />
          </IconButton>
        )}
      </figcaption>
    </figure>
  );
}

export function HandoutGallery({ handouts, onAdd, adding, onRename, onRemove, sharable, empty }: {
  handouts: Handout[] | null;
  /** Given, the gallery offers "+ Add handout" (several files at once). */
  onAdd?: (files: File[]) => void;
  adding?: boolean;
  onRename?: (h: Handout, title: string) => void;
  onRemove?: (h: Handout) => void;
  /** Each handout gets the eye that shows it on the player page. */
  sharable?: boolean;
  /** What to say when there are none (omit to show nothing). */
  empty?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [showing, setShowing] = useState<{ url: string; title: string } | null>(null);

  if (handouts === null) return <p className="as-empty-note">Loading handouts…</p>;
  return (
    <div className="ho">
      {handouts.length > 0 && (
        <div className="ho-grid">
          {handouts.map(h => (
            <HandoutCard key={h.id} h={h} sharable={sharable} onShow={url => setShowing({ url, title: h.title })}
              onRename={onRename && (t => onRename(h, t))} onRemove={onRemove && (() => onRemove(h))} />
          ))}
        </div>
      )}
      {handouts.length === 0 && empty && <p className="as-empty-note">{empty}</p>}
      {onAdd && (
        <>
          <Button size="xs" variant="secondary" onClick={() => input.current?.click()} disabled={adding}>
            {adding ? 'Uploading…' : '+ Add handout'}
          </Button>
          <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple hidden aria-label="Upload handouts"
            onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onAdd(files); }} />
        </>
      )}
      {showing && <Lightbox url={showing.url} title={showing.title} onClose={() => setShowing(null)} />}
    </div>
  );
}
