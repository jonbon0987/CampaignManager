import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast, type ToastAction } from './ToastContext';

function Trigger({ action }: { action?: ToastAction }) {
  const toast = useToast();
  return <button type="button" onClick={() => toast('NPC deleted', 'success', action)}>go</button>;
}

const show = (action?: ToastAction) => {
  render(<ToastProvider><Trigger action={action} /></ToastProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'go' }));
};

describe('ToastProvider', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('shows a toast for 3 seconds', () => {
    vi.useFakeTimers();
    show();
    expect(screen.getByText(/NPC deleted/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText(/NPC deleted/)).toBeNull();
  });

  it('keeps a toast with an action up longer, and its button runs it once', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    show({ label: 'Undo', onClick });
    act(() => { vi.advanceTimersByTime(3100); });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/NPC deleted/)).toBeNull();
  });

  it('lets a toast with an action go after 8 seconds', () => {
    vi.useFakeTimers();
    show({ label: 'Undo', onClick: vi.fn() });
    act(() => { vi.advanceTimersByTime(8100); });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
