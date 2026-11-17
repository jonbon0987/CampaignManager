import { useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

// Keyboard focus for a modal dialog:
//   - on open, focus moves into the dialog (or stays where a child's autoFocus put it);
//   - Tab and Shift+Tab cycle inside it instead of reaching the page behind;
//   - on close, focus goes back to where it was before the dialog opened.
//
// Where focus was before is read from a short history rather than from
// document.activeElement at mount: a child with autoFocus has already taken
// focus by the time any effect runs. The history also covers an opener that
// has since gone (a menu item whose menu closed): focus then returns to the
// most recent element that is still on the page, such as the menu's trigger.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const HISTORY_SIZE = 8;
const recentFocus: HTMLElement[] = [];

function recordFocus(e: FocusEvent) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  const at = recentFocus.indexOf(el);
  if (at !== -1) recentFocus.splice(at, 1);
  recentFocus.push(el);
  if (recentFocus.length > HISTORY_SIZE) recentFocus.shift();
}

// Installed once, when the first dialog module loads, so the element that
// opens the very first dialog is already on record.
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', recordFocus, true);
}

/** The most recently focused element that is still on the page and outside `container`. */
function focusBefore(container: HTMLElement): HTMLElement | null {
  for (let i = recentFocus.length - 1; i >= 0; i--) {
    const el = recentFocus[i];
    if (el.isConnected && !container.contains(el)) return el;
  }
  return null;
}

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => !el.closest('[hidden], [inert], [aria-hidden="true"]'));
}

/** Focus the first candidate that actually takes focus (a display:none one won't). */
function focusFirstOf(candidates: HTMLElement[]): boolean {
  for (const el of candidates) {
    el.focus();
    if (document.activeElement === el) return true;
  }
  return false;
}

/**
 * Traps keyboard focus in `ref` while `active`. Spread the returned `onKeyDown`
 * on the same element, and give that element `tabIndex={-1}` so it can hold
 * focus itself when nothing inside has asked for it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const returnTo = focusBefore(container);
    if (!container.contains(document.activeElement)) {
      container.focus({ preventScroll: true });
    }

    return () => {
      // Only pull focus back if it is still in the dialog or was dropped on the
      // page when the dialog unmounted; never take it from somewhere the
      // person deliberately moved it.
      const current = document.activeElement;
      const lost = !current || current === document.body || container.contains(current);
      if (lost && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [ref, active]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    // A dialog nested inside this one has already handled the key.
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const container = ref.current;
    if (!container) return;

    const items = focusables(container);
    if (items.length === 0) {
      e.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const current = document.activeElement as HTMLElement | null;
    const atStart = current === container || current === items[0];
    const atEnd = current === items[items.length - 1];

    if (e.shiftKey && atStart) {
      e.preventDefault();
      focusFirstOf([...items].reverse());
    } else if (!e.shiftKey && (atEnd || current === container)) {
      e.preventDefault();
      focusFirstOf(items);
    }
  };

  return { onKeyDown };
}
