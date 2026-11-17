import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed while `active`: for popovers, menus
 * and drawers that close on an outside click and so need a keyboard way out too.
 * (Modal and ConfirmContext handle Escape themselves.)
 */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}
