import { describe, it, expect } from 'vitest';
import {
  extractBlock, stripBlocks, parseCompleteObjects, parsePlanBlock, splitAnnotations,
} from './assistantParse';

describe('extractBlock', () => {
  it('extracts a closed json block', () => {
    expect(extractBlock('before\n```json\n[1,2]\n```\nafter', 'json')?.trim()).toBe('[1,2]');
  });
  it('extracts a still-streaming block with no closing fence', () => {
    expect(extractBlock('```json\n[{"a":1}', 'json')?.trim()).toBe('[{"a":1}');
  });
  it('returns null when the block is absent', () => {
    expect(extractBlock('just prose', 'json')).toBeNull();
  });
  it('keys off the language tag', () => {
    const text = '```plan\nTitle\n- step\n```\n```json\n[]\n```';
    expect(extractBlock(text, 'plan')?.trim()).toBe('Title\n- step');
  });
});

describe('stripBlocks', () => {
  it('removes both plan and json blocks, keeping prose', () => {
    const text = 'Drafting now.\n```plan\nT\n- a\n```\nHere:\n```json\n[]\n```';
    expect(stripBlocks(text)).toBe('Drafting now.\n\nHere:');
  });
  it('removes an unterminated trailing block mid-stream', () => {
    expect(stripBlocks('On it.\n```json\n[{"x":')).toBe('On it.');
  });
});

describe('parseCompleteObjects', () => {
  it('returns only fully-written objects as the array streams', () => {
    const partial = '[{"a":1},{"b":2},{"c":';
    const objs = parseCompleteObjects(partial);
    expect(objs).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('is not fooled by braces inside strings', () => {
    const block = '[{"text":"a } b { c"},{"n":2}]';
    expect(parseCompleteObjects(block)).toEqual([{ text: 'a } b { c' }, { n: 2 }]);
  });
  it('handles escaped quotes inside strings', () => {
    const block = '[{"q":"she said \\"hi\\" }"}]';
    expect(parseCompleteObjects(block)).toEqual([{ q: 'she said "hi" }' }]);
  });
  it('handles nested objects, counting only top-level entries', () => {
    const block = '[{"payload":{"deep":{"x":1}}},{"y":2}]';
    expect(parseCompleteObjects(block)).toEqual([{ payload: { deep: { x: 1 } } }, { y: 2 }]);
  });
  it('skips a malformed object without abandoning the rest', () => {
    const block = '[{"a":1},{bad},{"c":3}]';
    expect(parseCompleteObjects(block)).toEqual([{ a: 1 }, { c: 3 }]);
  });
  it('returns nothing for an empty array', () => {
    expect(parseCompleteObjects('[]')).toEqual([]);
  });
});

describe('parsePlanBlock', () => {
  it('parses a title and dash steps', () => {
    const text = '```plan\nPreparing Session 13\n- Review threads\n- Draft scenes\n```';
    expect(parsePlanBlock(text)).toEqual({
      title: 'Preparing Session 13',
      steps: [
        { label: 'Review threads', state: 'pending' },
        { label: 'Draft scenes', state: 'pending' },
      ],
    });
  });
  it('strips a leading markdown heading on the title', () => {
    expect(parsePlanBlock('```plan\n# My Plan\n- one\n```')?.title).toBe('My Plan');
  });
  it('returns null when there are no step lines', () => {
    expect(parsePlanBlock('```plan\nJust a title\n```')).toBeNull();
  });
  it('returns null when no plan block is present', () => {
    expect(parsePlanBlock('```json\n[]\n```')).toBeNull();
  });
  it('parses while the block is still open mid-stream', () => {
    const plan = parsePlanBlock('```plan\nTitle\n- first\n- second');
    expect(plan?.steps.map(s => s.label)).toEqual(['first', 'second']);
  });
});

describe('splitAnnotations', () => {
  it('separates UI fields from the action payload', () => {
    const { action, meta } = splitAnnotations({
      type: 'upsertNPC',
      reasoning: 'because',
      confidence: 0.9,
      step: 2,
      payload: { name: 'Sable' },
    });
    expect(action).toEqual({ type: 'upsertNPC', payload: { name: 'Sable' } });
    expect(meta).toEqual({ reasoning: 'because', confidence: 0.9, step: 2 });
  });
  it('drops annotations of the wrong type', () => {
    const { meta } = splitAnnotations({ type: 'x', confidence: '0.9', step: 'two' });
    expect(meta).toEqual({ reasoning: undefined, confidence: undefined, step: undefined });
  });
});
