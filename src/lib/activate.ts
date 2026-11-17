import type { KeyboardEvent } from 'react';

/**
 * Enter / Space handler for an element that acts as a button but can't be a
 * <button> because it holds other content or controls (a card, a tree row).
 * Pair it with role="button" and tabIndex={0}.
 *
 * Keys aimed at a control inside the element (a menu button in the card, an
 * input in the row) are left to that control.
 */
export const onActivate = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (isActivateKey(e)) fn();
};

/**
 * The test inside onActivate, for a handler that has to be written inline:
 * true (and the key's default prevented) for Enter / Space on the element
 * itself. Use it where the action reads a ref, which onActivate would capture
 * during render: `onKeyDown={e => { if (isActivateKey(e)) inputRef.current?.click(); }}`.
 */
export function isActivateKey(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.target !== e.currentTarget) return false;
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  return true;
}

/**
 * onActivate plus the tree keys: Right opens a collapsed node, Left closes an
 * open one. For rows in an outline (locations, module parts).
 */
export const onTreeRowKey = (select: () => void, expanded: boolean | undefined, setExpanded: (open: boolean) => void) =>
  (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    else if (e.key === 'ArrowRight' && expanded === false) { e.preventDefault(); setExpanded(true); }
    else if (e.key === 'ArrowLeft' && expanded === true) { e.preventDefault(); setExpanded(false); }
  };
