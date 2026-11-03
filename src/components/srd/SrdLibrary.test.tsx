import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SrdLibrary } from './SrdLibrary';

const open = (onAdd = vi.fn().mockResolvedValue(undefined)) => {
  const onClose = vi.fn();
  render(<SrdLibrary kind="monsters" open edition="2024" addLabel="Add to encounter" onAdd={onAdd} onClose={onClose}
    note={name => (name === 'Goblin Warrior' ? 'Uses your Goblin Warrior stat sheet.' : null)} />);
  return { onAdd, onClose };
};

describe('SrdLibrary', () => {
  it('starts on the campaign’s edition and credits that SRD', async () => {
    open();
    expect(await screen.findByText('341 creatures')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '2024 · SRD 5.2.1' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('link', { name: 'System Reference Document 5.2.1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '2014 · SRD 5.1' }));
    expect(await screen.findByText('334 creatures')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'System Reference Document 5.1' })).toBeTruthy();
  });

  it('narrows by type and CR, and previews the stat block it will save', async () => {
    open();
    await screen.findByText('341 creatures');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'dragon' } });
    fireEvent.change(screen.getByLabelText('Lowest CR'), { target: { value: '20' } });
    const count = screen.getByText(/of 341 creatures/).textContent!;
    expect(parseInt(count, 10)).toBeGreaterThan(0);
    expect(screen.getAllByText(/^CR (2\d|30) · dragon/).length).toBe(parseInt(count, 10));
    expect(screen.getByText('Actions & Traits')).toBeTruthy();
  });

  it('moves through the list with the arrow keys and adds with Enter', async () => {
    const { onAdd, onClose } = open();
    await screen.findByText('341 creatures');
    const search = screen.getByLabelText('Search creatures');
    fireEvent.change(search, { target: { value: 'goblin' } });
    const rows = () => [...document.querySelectorAll('.srd-list .cm-row')];
    expect(rows()[0].classList.contains('is-active')).toBe(true);
    const second = rows()[1].querySelector('.cm-row-title')!.textContent;
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(rows()[1].classList.contains('is-active')).toBe(true);
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: second }), '2024'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says what adding will do, and keeps the dialog open if it fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Offline'));
    open(onAdd);
    await screen.findByText('341 creatures');
    fireEvent.change(screen.getByLabelText('Search creatures'), { target: { value: 'goblin warrior' } });
    expect(screen.getByText('Uses your Goblin Warrior stat sheet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to encounter' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Offline');
    expect(screen.getByText('SRD creatures')).toBeTruthy();
  });
});
