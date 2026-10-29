import { describe, it, expect } from 'vitest';
import { splitMessage } from './messages.js';

describe('splitMessage', () => {
  it('leaves a short message whole', () => {
    expect(splitMessage('  The party reached the docks.  ')).toEqual(['The party reached the docks.']);
  });

  it('splits on paragraphs, then words, never past the limit', () => {
    const para = (n: number) => `Paragraph ${n} ${'word '.repeat(30).trim()}.`;
    const text = [1, 2, 3, 4].map(para).join('\n\n');
    const parts = splitMessage(text, 200);
    expect(parts.every(p => p.length <= 200)).toBe(true);
    expect(parts[0].startsWith('Paragraph 1')).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
    expect(splitMessage('x'.repeat(450), 200).map(p => p.length)).toEqual([200, 200, 50]);
  });
});
