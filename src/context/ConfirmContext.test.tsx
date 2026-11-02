import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from './ConfirmContext';

function Asker({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const confirm = useConfirm();
  return <button type="button" onClick={() => void confirm({ title: 'Delete for good?', message: 'Gone after this.' }).then(onAnswer)}>ask</button>;
}

describe('ConfirmProvider', () => {
  it('Esc cancels, and the dialog that asked doesn’t hear it', async () => {
    const onAnswer = vi.fn();
    const below = vi.fn();
    window.addEventListener('keydown', below);
    render(<ConfirmProvider><Asker onAnswer={onAnswer} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    expect(screen.getByText('Delete for good?')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
    expect(screen.queryByText('Delete for good?')).toBeNull();
    expect(below).not.toHaveBeenCalled();
    window.removeEventListener('keydown', below);
  });

  it('lets Esc through when nothing is being asked', () => {
    const below = vi.fn();
    window.addEventListener('keydown', below);
    render(<ConfirmProvider><Asker onAnswer={vi.fn()} /></ConfirmProvider>);
    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', below);
    expect(below).toHaveBeenCalledTimes(1);
  });
});
