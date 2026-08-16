import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import WorldCreationGate from './WorldCreationGate';

// createWorld / reloadWorldEntities are referenced inside the hoisted mock
// factory, so they must be created via vi.hoisted to exist before the mock runs.
const { createWorld, reloadWorldEntities, signOut, extractClientSide, submitDocument } = vi.hoisted(() => ({
  createWorld: vi.fn(),
  reloadWorldEntities: vi.fn(),
  signOut: vi.fn(),
  extractClientSide: vi.fn(),
  submitDocument: vi.fn(),
}));

vi.mock('../../context/WorldContext', () => ({
  useWorld: () => ({ createWorld, reloadWorldEntities }),
}));
vi.mock('../../lib/auth', () => ({ signOut }));

// Keep the example data + helpers real, but stub the DB-touching seeder so the
// example/import/AI create paths don't make network calls under test.
vi.mock('../../lib/worldSeeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/worldSeeds')>();
  return { ...actual, seedWorldEntities: vi.fn().mockResolvedValue(undefined) };
});

// Keep the action-formatting helpers real, but stub the two functions that
// actually touch the network — extraction + parsing — for the import path.
vi.mock('../../lib/documentImport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentImport')>();
  return { ...actual, extractClientSide, submitDocument };
});

function stageAFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['doc contents'], 'setting-bible.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const user = { email: 'dm@lair.co' } as User;

beforeEach(() => {
  vi.clearAllMocks();
  createWorld.mockResolvedValue({ id: 'w1', name: 'X', tagline: '', era: '', calendar: '', year: 1, campaignIds: [] });
  extractClientSide.mockResolvedValue({ kind: 'text', payload: 'doc contents' });
  submitDocument.mockResolvedValue({ summary: 'A parsed summary.', actions: [] });
});

describe('WorldCreationGate', () => {
  it('renders the menu with all four entry paths and the signed-in email', () => {
    render(<WorldCreationGate user={user} />);
    expect(screen.getByText('Create your first world')).toBeTruthy();
    expect(screen.getByText('Start from scratch')).toBeTruthy();
    expect(screen.getByText('Use a prebuilt example')).toBeTruthy();
    expect(screen.getByText('Import from a document')).toBeTruthy();
    expect(screen.getByText('Generate with the Assistant')).toBeTruthy();
    expect(screen.getByText('dm@lair.co')).toBeTruthy();
  });

  it('logs out from the menu footer', () => {
    render(<WorldCreationGate user={user} />);
    fireEvent.click(screen.getByText('Log out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('scratch path: disables Create until a name is entered, then calls createWorld with name + tagline', async () => {
    render(<WorldCreationGate user={user} />);
    fireEvent.click(screen.getByText('Start from scratch'));

    const createBtn = screen.getByRole('button', { name: 'Create world' }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('e.g. The Amber Waste'), { target: { value: '  Aldercross  ' } });
    fireEvent.change(screen.getByPlaceholderText('A line that captures its feel.'), { target: { value: 'Old roads, older debts.' } });
    expect(createBtn.disabled).toBe(false);

    fireEvent.click(createBtn);
    await waitFor(() => expect(createWorld).toHaveBeenCalledWith('Aldercross', 'Old roads, older debts.'));
  });

  it('example path: shows the three prebuilt worlds and seeds the chosen one on create', async () => {
    render(<WorldCreationGate user={user} />);
    fireEvent.click(screen.getByText('Use a prebuilt example'));

    expect(screen.getByText('The Amber Waste')).toBeTruthy();
    expect(screen.getByText('Emberhold')).toBeTruthy();
    expect(screen.getByText('The Sunless Tide')).toBeTruthy();

    const createBtn = screen.getByRole('button', { name: 'Create from this world' }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    fireEvent.click(screen.getByText('Emberhold'));
    expect(createBtn.disabled).toBe(false);

    fireEvent.click(createBtn);
    // Seeding is passed into createWorld (runs before the world activates) so its
    // data loads in a single pass — hence a seeder function as the third arg.
    await waitFor(() => expect(createWorld).toHaveBeenCalledWith(
      'Emberhold',
      'A dwarven hold clinging to the lip of a slumbering flame.',
      expect.any(Function),
    ));
  });

  it('back navigation returns to the menu from a panel', () => {
    render(<WorldCreationGate user={user} />);
    fireEvent.click(screen.getByText('Start from scratch'));
    expect(screen.getByText('Name your world')).toBeTruthy();
    fireEvent.click(screen.getByText('‹ All options'));
    expect(screen.getByText('Create your first world')).toBeTruthy();
  });

  describe('import path', () => {
    it('stages a picked file without starting the parse until "Start import" is clicked', async () => {
      const { container } = render(<WorldCreationGate user={user} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);

      // Staged, not reading — the file is shown but nothing has been sent yet.
      expect(await screen.findByText('setting-bible.txt')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start import' })).toBeTruthy();
      expect(extractClientSide).not.toHaveBeenCalled();
      expect(submitDocument).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
      await waitFor(() => expect(submitDocument).toHaveBeenCalledTimes(1));
    });

    it('"Choose a different file" from the staged screen discards it without ever parsing', async () => {
      const { container } = render(<WorldCreationGate user={user} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);
      expect(await screen.findByText('setting-bible.txt')).toBeTruthy();

      fireEvent.click(screen.getByText('Choose a different file'));
      expect(screen.getByText(/Drop a file here/)).toBeTruthy();
      expect(submitDocument).not.toHaveBeenCalled();
    });

    it('reaches the ready screen with a filename-derived name only after starting the import', async () => {
      const { container } = render(<WorldCreationGate user={user} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);
      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create world' })).toBeTruthy());
      expect((screen.getByDisplayValue('Setting Bible') as HTMLInputElement).value).toBe('Setting Bible');
    });
  });

  describe('additional-world mode (onClose provided)', () => {
    it('uses new-world wording and a Cancel affordance instead of log out', () => {
      render(<WorldCreationGate onClose={vi.fn()} />);
      expect(screen.getByText('Create a new world')).toBeTruthy();
      expect(screen.queryByText('Create your first world')).toBeNull();
      expect(screen.queryByText('Log out')).toBeNull();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('closes via the ✕ button and via menu Cancel', () => {
      const onClose = vi.fn();
      render(<WorldCreationGate onClose={onClose} />);
      fireEvent.click(screen.getByLabelText('Close'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('calls onClose after a successful create (overlay dismisses)', async () => {
      const onClose = vi.fn();
      render(<WorldCreationGate onClose={onClose} />);
      fireEvent.click(screen.getByText('Start from scratch'));
      fireEvent.change(screen.getByPlaceholderText('e.g. The Amber Waste'), { target: { value: 'Second World' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create world' }));
      await waitFor(() => expect(createWorld).toHaveBeenCalledWith('Second World', ''));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
  });
});
