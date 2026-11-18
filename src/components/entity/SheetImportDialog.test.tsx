import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../lib/readCharacterSheet', () => ({ readCharacterSheet: h.read }));

import { SheetImportDialog } from './SheetImportDialog';

const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' });
const choose = (files: File[]) => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};
const pcs = [{ id: 'p1', character_name: 'Bram', level: 4, armor_class: 18, race: 'Dwarf' }];

beforeEach(() => {
  h.read.mockReset();
  h.read.mockImplementation(async (f: File) => (f.name === 'bad.pdf'
    ? Promise.reject(new Error('bad.pdf has no text to read; it may be a scan.'))
    : f.name === 'bram.pdf'
      ? { file: f.name, source: 'form', values: { character_name: 'Bram', level: 5, armor_class: 18, race: 'Dwarf', max_hp: 43 } }
      : { file: f.name, source: 'ai', values: { character_name: 'Cass', class: 'Bard', level: 3 } }));
});

describe('SheetImportDialog', () => {
  it('matches sheets to PCs by name, shows only what changes, and imports what stays ticked', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<SheetImportDialog isOpen onClose={onClose} pcs={pcs} onApply={onApply} />);
    choose([pdf('bram.pdf'), pdf('cass.pdf'), pdf('bad.pdf')]);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/may be a scan/));
    expect((screen.getByLabelText('Import bram.pdf into') as HTMLSelectElement).value).toBe('p1');
    expect((screen.getByLabelText('Import cass.pdf into') as HTMLSelectElement).value).toBe('new');
    expect(screen.getByText('Read from the form')).toBeTruthy();
    expect(screen.getByText('Read by the assistant')).toBeTruthy();

    // Bram: level 4 → 5 and a new max HP; AC and race already match, so they aren't listed.
    expect(screen.getAllByLabelText(/^Apply /).map(c => c.getAttribute('aria-label'))).toEqual(
      ['Apply Level', 'Apply Max HP', 'Apply Name', 'Apply Class', 'Apply Level'],
    );
    fireEvent.click(screen.getAllByLabelText('Apply Max HP')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 sheets' }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0]).toEqual([
      { pcId: 'p1', patch: { level: 5 }, file: 'bram.pdf' },
      { pcId: null, patch: { character_name: 'Cass', class: 'Bard', level: 3 }, file: 'cass.pdf' },
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('can send a sheet to a different PC', async () => {
    const onApply = vi.fn();
    render(<SheetImportDialog isOpen onClose={vi.fn()} pcs={pcs} onApply={onApply} />);
    choose([pdf('cass.pdf')]);
    const target = await screen.findByLabelText('Import cass.pdf into');
    fireEvent.change(target, { target: { value: 'p1' } });
    expect(screen.getByText('Now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 sheet' }));
    await waitFor(() => expect(onApply.mock.calls[0][0][0].pcId).toBe('p1'));
  });

  it('imports into one PC when given a target', async () => {
    const onApply = vi.fn();
    render(<SheetImportDialog isOpen onClose={vi.fn()} pcs={[]} target={pcs[0]} onApply={onApply} />);
    expect(screen.getByText(/Import a sheet into Bram/)).toBeTruthy();
    choose([pdf('bram.pdf')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onApply.mock.calls[0][0]).toEqual([{ pcId: 'p1', patch: { level: 5, max_hp: 43 }, file: 'bram.pdf' }]));
    expect(screen.queryByLabelText('Import bram.pdf into')).toBeNull();
  });
});
