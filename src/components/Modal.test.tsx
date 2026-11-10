import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

const show = (onClose = vi.fn(), onSave = vi.fn()) => {
  render(<Modal isOpen onClose={onClose} title="Test" onSave={onSave} saveLabel="Go"><p>Body</p></Modal>);
  const backdrop = screen.getByText('Test').closest('.fixed') as HTMLElement;
  return { onClose, onSave, backdrop };
};

describe('Modal', () => {
  it('closes on a click that starts and ends outside it', () => {
    const { onClose, backdrop } = show();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when a press on its button ends over the backdrop', () => {
    // A dropdown closing on mousedown can shrink the modal so the pointer is
    // over the backdrop by mouseup; the browser then sends the click there.
    const { onClose, onSave, backdrop } = show();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays open when a text selection is dragged out of it', () => {
    const { onClose, backdrop } = show();
    fireEvent.mouseDown(screen.getByText('Body'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from its buttons and Escape', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
