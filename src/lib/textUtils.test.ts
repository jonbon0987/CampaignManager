import { describe, it, expect } from 'vitest';
import type { RefObject } from 'react';
import { insertAtCursor } from './textUtils';

// A minimal stand-in for the textarea ref — only selectionStart/End are read.
function refAt(start: number, end = start): RefObject<HTMLTextAreaElement | null> {
  return { current: { selectionStart: start, selectionEnd: end } as HTMLTextAreaElement };
}
const nullRef: RefObject<HTMLTextAreaElement | null> = { current: null };

const LINK = '[[npc:12345678-1234-1234-1234-123456789012]]';

describe('insertAtCursor — plain text', () => {
  it('splices text at the cursor position', () => {
    expect(insertAtCursor(refAt(5), 'hello world', 'X')).toBe('helloX world');
  });

  it('replaces the current selection', () => {
    expect(insertAtCursor(refAt(0, 5), 'hello world', 'hi')).toBe('hi world');
  });

  it('appends at end when the ref has no element (cursor falls back to length)', () => {
    expect(insertAtCursor(nullRef, 'abc', 'Z')).toBe('abcZ');
  });

  it('inserts at the start when the cursor is at index 0', () => {
    expect(insertAtCursor(refAt(0), 'world', 'hello ')).toBe('hello world');
  });

  it('handles inserting into an empty string', () => {
    expect(insertAtCursor(refAt(0), '', 'first')).toBe('first');
  });
});

describe('insertAtCursor — entity link markup', () => {
  it('appends an entity link to the end regardless of cursor position', () => {
    expect(insertAtCursor(refAt(2), 'hello', LINK)).toBe(`hello\n${LINK}`);
  });

  it('appends without a leading newline when the value is empty', () => {
    expect(insertAtCursor(refAt(0), '', LINK)).toBe(LINK);
  });

  it('trims trailing whitespace before appending the link', () => {
    expect(insertAtCursor(refAt(0), 'hello   \n\n', LINK)).toBe(`hello\n${LINK}`);
  });

  it('treats a string that only looks partially like a link as plain text', () => {
    const notALink = '[[npc:not-a-uuid]]';
    expect(insertAtCursor(refAt(0), 'abc', notALink)).toBe(`${notALink}abc`);
  });
});
