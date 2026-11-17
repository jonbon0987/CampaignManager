import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed while `active`: for popovers, menus
 * and drawers that close on an outside click and so need a keyboard way out too.
 * (Modal and ConfirmContext handle Escape themselves.)
 */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    // Skip an Escape that something inside already handled, such as the slash
    // menu closing, so one press closes one thing.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}
