import type { RefObject } from 'react';

const ENTITY_LINK_PATTERN = /^\[\[(creature|npc|location|session|faction|hook):[a-f0-9-]{36}(?:[^\]]*)?\]\]$/;

/**
 * Inserts `insertText` at the current cursor position in the textarea referenced by `ref`.
 * Returns the new string value with the text spliced in.
 *
 * Entity link markup (e.g. [[npc:uuid:Name]]) is always appended to the end of the value
 * since entity links are rendered as separate visual chips, not inline in the text.
 */
export function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | null>,
  currentValue: string,
  insertText: string,
): string {
  // Entity links are always appended (they display as chips, not inline text)
  if (ENTITY_LINK_PATTERN.test(insertText)) {
    const trimmed = currentValue.trimEnd();
    return trimmed + (trimmed ? '\n' : '') + insertText;
  }

  const el = ref.current;
  const start = el?.selectionStart ?? currentValue.length;
  const end = el?.selectionEnd ?? currentValue.length;
  return currentValue.slice(0, start) + insertText + currentValue.slice(end);
}
