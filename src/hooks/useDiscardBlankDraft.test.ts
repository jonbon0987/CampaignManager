import { StrictMode, createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { markDraft, useDiscardBlankDraft } from './useDiscardBlankDraft';

const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe('useDiscardBlankDraft', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('deletes a blank draft when the DM moves to another record', () => {
    const remove = vi.fn();
    markDraft('a');
    const { rerender } = renderHook(({ id }) => useDiscardBlankDraft(id, true, remove), { initialProps: { id: 'a' } });
    rerender({ id: 'b' });
    act(() => { vi.runAllTimers(); });
    expect(remove).toHaveBeenCalledWith('a');
  });

  it('deletes a blank draft when its page closes', () => {
    const remove = vi.fn();
    markDraft('c');
    const { unmount } = renderHook(() => useDiscardBlankDraft('c', true, remove));
    unmount();
    act(() => { vi.runAllTimers(); });
    expect(remove).toHaveBeenCalledWith('c');
  });

  it('keeps a draft the DM wrote something in', () => {
    const remove = vi.fn();
    markDraft('d');
    const { rerender, unmount } = renderHook(({ blank }) => useDiscardBlankDraft('d', blank, remove), { initialProps: { blank: true } });
    rerender({ blank: false });
    unmount();
    act(() => { vi.runAllTimers(); });
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes a record that was not created as a draft', () => {
    const remove = vi.fn();
    const { unmount } = renderHook(() => useDiscardBlankDraft('existing', true, remove));
    unmount();
    act(() => { vi.runAllTimers(); });
    expect(remove).not.toHaveBeenCalled();
  });

  it('survives React running effects twice in development', () => {
    const remove = vi.fn();
    markDraft('e');
    const { unmount } = renderHook(() => useDiscardBlankDraft('e', true, remove), { wrapper: strict });
    act(() => { vi.runAllTimers(); });
    expect(remove).not.toHaveBeenCalled();
    unmount();
    act(() => { vi.runAllTimers(); });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
