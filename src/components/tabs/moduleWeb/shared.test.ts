import { describe, it, expect } from 'vitest';
import { labelLines } from './shared';

describe('labelLines', () => {
  it('leaves a short name on one line', () => {
    expect(labelLines('The Wharf', 24)).toEqual(['The Wharf']);
  });

  it('wraps a long name to two lines at a word break', () => {
    expect(labelLines('The Harbormaster’s Letter', 20)).toEqual(['The Harbormaster’s', 'Letter']);
  });

  it('cuts only what won’t fit in two lines', () => {
    expect(labelLines('Escape from the Drowned Wharf Party at Midnight', 20)).toEqual(['Escape from the', 'Drowned Wharf Party…']);
  });

  it('gives the whole name when asked', () => {
    expect(labelLines('Escape from the Drowned Wharf Party at Midnight', 20, true)).toEqual(['Escape from the', 'Drowned Wharf Party', 'at Midnight']);
  });

  it('copes with no name', () => {
    expect(labelLines('', 20)).toEqual([]);
    expect(labelLines(null, 20)).toEqual([]);
  });

  it('cuts a single word too long for a line', () => {
    expect(labelLines('Supercalifragilisticexpialidocious', 20)).toEqual(['Supercalifragilisti…']);
  });
});
