// One picture on a record: an NPC's or PC's portrait, a place's map. Pick a
// file and it's shrunk, uploaded to the private image bucket and set; the
// record saves it with everything else. Click the picture to see it full size.

import { useRef, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { EntityImages } from '../../lib/db';
import { IMAGE_ACCEPT, uploadImage } from '../../lib/images';
import { useImageUrl } from '../../hooks/useImageUrl';
import { Button } from './Button';
import { Lightbox } from './Lightbox';

export function ImageSlot({ path, onChange, label, shape = 'portrait', disabled }: {
  path: string | null;
  onChange: (path: string | null) => void;
  /** What the picture is: "Portrait", "Map". */
  label: string;
  /** A portrait is tall; a map is wide. */
  shape?: 'portrait' | 'wide';
  disabled?: boolean;
}) {
  const url = useImageUrl(path);
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(false);

  // The old picture goes once the new one is set, so nothing is left behind.
  const replace = (next: string | null) => {
    const old = path;
    onChange(next);
    if (old && old !== next) void EntityImages.remove([old]).catch(() => {});
  };

  const pick = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      replace(await uploadImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t upload that picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`img-slot is-${shape}`}>
      {path ? (
        <button type="button" className="img-slot-frame" onClick={() => url && setViewing(true)} aria-label={`View the ${label.toLowerCase()}`}>
          {url ? <img src={url} alt={label} /> : <span className="img-slot-note">Loading…</span>}
        </button>
      ) : (
        <button type="button" className="img-slot-frame is-empty" onClick={() => input.current?.click()} disabled={disabled || busy}>
          <span className="img-slot-note">{busy ? 'Uploading…' : `+ ${label}`}</span>
        </button>
      )}
      {path && !disabled && (
        <div className="img-slot-actions">
          <Button size="xs" variant="ghost" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Uploading…' : 'Replace'}</Button>
          <Button size="xs" variant="ghost" onClick={async () => { if (await confirm(`Remove the ${label.toLowerCase()}? The picture is deleted.`)) replace(null); }} disabled={busy}>Remove</Button>
        </div>
      )}
      <input ref={input} type="file" accept={IMAGE_ACCEPT} hidden aria-label={`Upload a ${label.toLowerCase()}`}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      {error && <p className="img-slot-error" role="alert">{error}</p>}
      {viewing && url && <Lightbox url={url} title={label} onClose={() => setViewing(false)} />}
    </div>
  );
}
