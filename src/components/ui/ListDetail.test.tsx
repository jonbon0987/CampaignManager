import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ListDetail } from './ListDetail';

// jsdom doesn't lay anything out, so stand in for the browser's measurements.
let report: (width: number) => void = () => {};
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {
    report = width => this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

afterEach(() => vi.unstubAllGlobals());

const show = () => render(<ListDetail title="Cast" count={2} search="" onSearchChange={() => {}} list={<div />} detail={<div />} />)
  .container.querySelector('.cm-md')!;

describe('ListDetail on a narrow page', () => {
  it('narrows its list once the page gets narrow, and widens it again after', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const root = show();
    act(() => report(1100));
    expect(root.className).not.toContain('is-narrow');
    act(() => report(640));
    expect(root.className).toContain('is-narrow');
    act(() => report(900));
    expect(root.className).not.toContain('is-narrow');
  });

  it('keeps the usual layout where it can’t measure', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(show().className).not.toContain('is-narrow');
  });
});
