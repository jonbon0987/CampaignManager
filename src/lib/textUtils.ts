import type { RefObject } from 'react';

/**
 * Inserts `insertText` at the current cursor position in the textarea referenced by `ref`.
 * Returns the new string value with the text spliced in.
 */
export function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | null>,
  currentValue: string,
  insertText: string,
): string {
  const el = ref.current;
  const start = el?.selectionStart ?? currentValue.length;
  const end = el?.selectionEnd ?? currentValue.length;
  return currentValue.slice(0, start) + insertText + currentValue.slice(end);
}
