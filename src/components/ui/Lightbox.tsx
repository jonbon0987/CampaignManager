import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * A picture filling the screen, to study a map or turn the laptop round and
 * show the players a handout. Esc or a click closes it.
 */
export function Lightbox({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="lbx" role="dialog" aria-modal="true" aria-label={title || 'Image'} onClick={onClose}>
      <img className="lbx-img" src={url} alt={title || ''} />
      {title && <div className="lbx-title">{title}</div>}
      <div className="lbx-hint">Esc or click to close</div>
    </div>,
    document.body,
  );
}
