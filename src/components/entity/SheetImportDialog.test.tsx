import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ readPC: vi.fn(), readNPC: vi.fn() }));
vi.mock('../../lib/readCharacterSheet', () => ({ readCharacterSheet: h.readPC, readNpcSheet: h.readNPC }));

import { SheetImportDialog } from './SheetImportDialog';
import { npcSheetKind, pcSheetKind } from './sheetKinds';
import { patchFrom } from '../../lib/characterSheet';

const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' });
const choose = (files: File[]) => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};
const pcs = [{ id: 'p1', character_name: 'Bram', level: 4, armor_class: 18, race: 'Dwarf' }];
const pcKind = pcSheetKind(id => pcs.find(p => p.id === id));
const pcTargets = pcs.map(p => ({ id: p.id, name: p.character_name }));

beforeEach(() => {
  h.readPC.mockReset();
  h.readPC.mockImplementation(async (f: File) => (f.name === 'bad.pdf'
    ? Promise.reject(new Error('bad.pdf has no text to read; it may be a scan.'))
    : f.name === 'bram.pdf'
      ? { file: f.name, source: 'form', values: { character_name: 'Bram', level: 5, armor_class: 18, race: 'Dwarf', max_hp: 43 } }
      : { file: f.name, source: 'ai', values: { character_name: 'Cass', class: 'Bard', level: 3 } }));
});

describe('SheetImportDialog with player characters', () => {
  it('matches sheets by name, shows only what changes, and imports what stays ticked', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<SheetImportDialog isOpen onClose={onClose} kind={pcKind} targets={pcTargets} onApply={onApply} />);
    choose([pdf('bram.pdf'), pdf('cass.pdf'), pdf('bad.pdf')]);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/may be a scan/));
    expect((screen.getByLabelText('Import bram.pdf into') as HTMLSelectElement).value).toBe('p1');
    expect((screen.getByLabelText('Import cass.pdf into') as HTMLSelectElement).value).toBe('new');
    expect(screen.getByText('Read from the form')).toBeTruthy();
    expect(screen.getByText('Read by the assistant')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Apply /).map(c => c.getAttribute('aria-label'))).toEqual(
      ['Apply Level', 'Apply Max HP', 'Apply Name', 'Apply Class', 'Apply Level'],
    );
    fireEvent.click(screen.getAllByLabelText('Apply Max HP')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 sheets' }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const imports = onApply.mock.calls[0][0] as { targetId: string | null; changes: Parameters<typeof patchFrom>[0]; file: string }[];
    expect(imports.map(i => [i.targetId, patchFrom(i.changes), i.file])).toEqual([
      ['p1', { level: 5 }, 'bram.pdf'],
      [null, { character_name: 'Cass', class: 'Bard', level: 3 }, 'cass.pdf'],
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('can send a sheet to a different record', async () => {
    const onApply = vi.fn();
    render(<SheetImportDialog isOpen onClose={vi.fn()} kind={pcKind} targets={pcTargets} onApply={onApply} />);
    choose([pdf('cass.pdf')]);
    fireEvent.change(await screen.findByLabelText('Import cass.pdf into'), { target: { value: 'p1' } });
    expect(screen.getByText('Now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 sheet' }));
    await waitFor(() => expect(onApply.mock.calls[0][0][0].targetId).toBe('p1'));
  });

  it('imports into one record when given a target', async () => {
    const onApply = vi.fn();
    render(<SheetImportDialog isOpen onClose={vi.fn()} kind={pcKind} targets={[]} target={pcTargets[0]} onApply={onApply} />);
    expect(screen.getByText(/Import a sheet into Bram/)).toBeTruthy();
    choose([pdf('bram.pdf')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(patchFrom(onApply.mock.calls[0][0][0].changes)).toEqual({ level: 5, max_hp: 43 }));
    expect(screen.queryByLabelText('Import bram.pdf into')).toBeNull();
  });
});

describe('SheetImportDialog with NPCs', () => {
  const npcs = [{ id: 'n1', name: 'Mara Vell', role: 'Smuggler', statblock_id: 's1' }, { id: 'n2', name: 'Old Tom', statblock_id: null }];
  const statblocks = [{ id: 's1', name: 'Mara (old)', armor_class: 15, hit_points: 20 }];
  const kind = npcSheetKind(id => npcs.find(n => n.id === id), id => statblocks.find(s => s.id === id));
  beforeEach(() => {
    h.readNPC.mockReset();
    h.readNPC.mockImplementation(async (f: File) => ({
      file: f.name, source: 'form',
      sheet: { npc: { name: 'Mara Vell', role: 'Half-Elf Rogue 5' }, statblock: { name: 'Mara Vell', armor_class: 15, hit_points: 33 } },
    }));
  });

  it('groups the NPC’s changes and its linked stat sheet’s, and says when the stat sheet is new', async () => {
    const onApply = vi.fn();
    render(<SheetImportDialog isOpen onClose={vi.fn()} kind={kind} targets={npcs} onApply={onApply} />);
    expect(screen.getByText(/stat block works too/)).toBeTruthy();
    choose([pdf('mara.pdf')]);
    expect((await screen.findByLabelText('Import mara.pdf into') as HTMLSelectElement).value).toBe('n1');
    expect(screen.getByText('NPC')).toBeTruthy();
    expect(screen.getByText('Stat sheet: Mara (old)')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Apply /).map(c => c.getAttribute('aria-label'))).toEqual(
      ['Apply NPC: Role', 'Apply Stat sheet: Mara (old): Name', 'Apply Stat sheet: Mara (old): Hit points'],
    );
    fireEvent.change(screen.getByLabelText('Import mara.pdf into'), { target: { value: 'n2' } });
    expect(screen.getByText('New stat sheet, linked to the NPC')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 sheet' }));
    await waitFor(() => expect(onApply.mock.calls[0][0][0].targetId).toBe('n2'));
  });
});
