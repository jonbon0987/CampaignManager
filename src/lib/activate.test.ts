import { describe, it, expect, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { onActivate, onTreeRowKey, isActivateKey } from './activate';

// Just enough of a React keyboard event for the helpers.
function key(k: string, opts: { inner?: boolean } = {}) {
  const el = {};
  const e = { key: k, target: opts.inner ? {} : el, currentTarget: el, preventDefault: vi.fn() };
  return e as unknown as KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('onActivate', () => {
  it('runs on Enter and Space, and stops Space from scrolling the page', () => {
    const fn = vi.fn();
    const handler = onActivate(fn);
    handler(key('Enter'));
    const space = key(' ');
    handler(space);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(space.preventDefault).toHaveBeenCalled();
  });

  it('ignores other keys, and keys aimed at a control inside the element', () => {
    const fn = vi.fn();
    const handler = onActivate(fn);
    handler(key('a'));
    handler(key('Tab'));
    handler(key('Enter', { inner: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('shares its test with isActivateKey', () => {
    expect(isActivateKey(key(' '))).toBe(true);
    expect(isActivateKey(key('Escape'))).toBe(false);
    expect(isActivateKey(key('Enter', { inner: true }))).toBe(false);
  });
});

describe('onTreeRowKey', () => {
  it('selects on Enter, opens a closed node on Right and closes an open one on Left', () => {
    const select = vi.fn();
    const setOpen = vi.fn();
    onTreeRowKey(select, false, setOpen)(key('Enter'));
    onTreeRowKey(select, false, setOpen)(key('ArrowRight'));
    onTreeRowKey(select, true, setOpen)(key('ArrowLeft'));
    expect(select).toHaveBeenCalledTimes(1);
    expect(setOpen.mock.calls).toEqual([[true], [false]]);
  });

  it('leaves Right on an open node, Left on a closed one, and arrows on a leaf alone', () => {
    const setOpen = vi.fn();
    const right = key('ArrowRight');
    onTreeRowKey(vi.fn(), true, setOpen)(right);
    onTreeRowKey(vi.fn(), false, setOpen)(key('ArrowLeft'));
    onTreeRowKey(vi.fn(), undefined, setOpen)(key('ArrowRight'));
    expect(setOpen).not.toHaveBeenCalled();
    expect(right.preventDefault).not.toHaveBeenCalled();
  });
});
