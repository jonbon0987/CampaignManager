import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';
import { ConfirmProvider, useConfirm } from '../context/ConfirmContext';

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
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  describe('keyboard focus', () => {
    // The page behind the dialog, with the button that opens it.
    function Page({ autoFocusField = false }: { autoFocusField?: boolean }) {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>open</button>
          <button type="button">behind</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Edit" onSave={vi.fn()}>
            <input aria-label="Name" autoFocus={autoFocusField} />
          </Modal>
        </>
      );
    }
    const openFrom = () => {
      const opener = screen.getByRole('button', { name: 'open' });
      opener.focus();
      fireEvent.click(opener);
      return opener;
    };

    it('is a modal dialog named by its title', () => {
      render(<Page />);
      openFrom();
      const dialog = screen.getByRole('dialog', { name: 'Edit' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('moves focus into the dialog when it opens', () => {
      render(<Page />);
      openFrom();
      expect(screen.getByRole('dialog')).toBe(document.activeElement);
    });

    it('leaves focus on a field that asked for it', () => {
      render(<Page autoFocusField />);
      openFrom();
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    });

    it('keeps Tab and Shift+Tab inside the dialog', () => {
      render(<Page />);
      openFrom();
      const close = screen.getByRole('button', { name: 'Close dialog' });
      const save = screen.getByRole('button', { name: 'Save' });

      save.focus();
      fireEvent.keyDown(save, { key: 'Tab' });
      expect(document.activeElement).toBe(close);

      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(save);

      // From the dialog itself, Shift+Tab goes to its last control, not the page.
      const dialog = screen.getByRole('dialog');
      dialog.focus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(save);
    });

    it('returns focus to the opener when it closes', () => {
      render(<Page autoFocusField />);
      const opener = openFrom();
      fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it('returns focus into the modal after a confirm it opened is answered', async () => {
      function WithConfirm() {
        const confirm = useConfirm();
        return (
          <Modal isOpen onClose={vi.fn()} title="Edit">
            <button type="button" onClick={() => void confirm({ title: 'Sure?', message: 'Really.' })}>delete</button>
          </Modal>
        );
      }
      render(<ConfirmProvider><WithConfirm /></ConfirmProvider>);
      const del = screen.getByRole('button', { name: 'delete' });
      del.focus();
      fireEvent.click(del);
      const confirmDialog = screen.getByRole('alertdialog', { name: 'Sure?' });
      expect(confirmDialog.contains(document.activeElement)).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(del);
    });
  });
});
