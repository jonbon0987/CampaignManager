import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampaignCreationGate from './CampaignCreationGate';

const { createCampaign, openCampaign, seedCampaignHooks, extractClientSide, submitDocument } = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  openCampaign: vi.fn(),
  seedCampaignHooks: vi.fn(),
  extractClientSide: vi.fn(),
  submitDocument: vi.fn(),
}));

vi.mock('../../context/WorldContext', () => ({
  useWorld: () => ({ createCampaign, openCampaign, activeWorld: { name: 'Test World' } }),
}));

// Keep templates/helpers real, but stub the DB-touching hook seeder.
vi.mock('../../lib/campaignSeeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/campaignSeeds')>();
  return { ...actual, seedCampaignHooks };
});

// Keep the action-formatting helpers real, but stub the two functions that
// actually touch the network — extraction + parsing — for the import path.
vi.mock('../../lib/documentImport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentImport')>();
  return { ...actual, extractClientSide, submitDocument };
});

function stageAFile(container: HTMLElement, opts: { name?: string; size?: number } = {}) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['doc contents'], opts.name ?? 'notes.txt', { type: 'text/plain' });
  if (opts.size != null) Object.defineProperty(file, 'size', { value: opts.size, configurable: true });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  createCampaign.mockResolvedValue({ id: 'c1', worldId: 'w1', name: 'X', sessions: 0, party: '', lastPlayed: '', status: 'active' });
  seedCampaignHooks.mockResolvedValue(undefined);
  extractClientSide.mockResolvedValue({ kind: 'text', payload: 'doc contents' });
  submitDocument.mockResolvedValue({ summary: 'A parsed summary.', actions: [] });
});

describe('CampaignCreationGate', () => {
  it('renders the menu with all four paths and the active world name', () => {
    render(<CampaignCreationGate onClose={vi.fn()} />);
    expect(screen.getByText('Start a new campaign')).toBeTruthy();
    expect(screen.getByText('Start from scratch')).toBeTruthy();
    expect(screen.getByText('Use a template')).toBeTruthy();
    expect(screen.getByText('Import from a document')).toBeTruthy();
    expect(screen.getByText('Generate with the Assistant')).toBeTruthy();
    expect(screen.getByText(/Test World/)).toBeTruthy();
  });

  it('closes via the ✕ button and via menu Cancel', () => {
    const onClose = vi.fn();
    render(<CampaignCreationGate onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('scratch: creates the campaign with premise + party, then opens it and closes', async () => {
    const onClose = vi.fn();
    render(<CampaignCreationGate onClose={onClose} />);
    fireEvent.click(screen.getByText('Start from scratch'));

    const createBtn = screen.getByRole('button', { name: 'Create campaign' }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('e.g. The Gathering Storm'), { target: { value: 'My Campaign' } });
    fireEvent.change(screen.getByPlaceholderText(/situation, the stakes/), { target: { value: 'A war brews.' } });
    fireEvent.change(screen.getByPlaceholderText(/describing the party|Free Cities/i), { target: { value: 'Three sellswords.' } });
    expect(createBtn.disabled).toBe(false);

    fireEvent.click(createBtn);
    await waitFor(() => expect(createCampaign).toHaveBeenCalledWith('My Campaign', { plot_summary: 'A war brews.', party: 'Three sellswords.' }));
    await waitFor(() => expect(openCampaign).toHaveBeenCalledWith('c1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('template: shows the three templates and seeds the chosen one on create', async () => {
    render(<CampaignCreationGate onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Use a template'));

    expect(screen.getByText('The Gathering Storm')).toBeTruthy();
    expect(screen.getByText('Bones of the Deep')).toBeTruthy();
    expect(screen.getByText('A Quiet Little Town')).toBeTruthy();

    const createBtn = screen.getByRole('button', { name: 'Create from this template' }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    fireEvent.click(screen.getByText('The Gathering Storm'));
    expect(createBtn.disabled).toBe(false);

    fireEvent.click(createBtn);
    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    expect(createCampaign.mock.calls[0][0]).toBe('The Gathering Storm');
    // Starter threads seeded against the new campaign id.
    await waitFor(() => expect(seedCampaignHooks).toHaveBeenCalledWith('c1', expect.arrayContaining([
      expect.objectContaining({ title: 'The Missing Envoy' }),
    ])));
    await waitFor(() => expect(openCampaign).toHaveBeenCalledWith('c1'));
  });

  it('back navigation returns to the menu from a panel', () => {
    render(<CampaignCreationGate onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Use a template'));
    expect(screen.getByText('Choose a starting premise')).toBeTruthy();
    fireEvent.click(screen.getByText('‹ All options'));
    expect(screen.getByText('Start a new campaign')).toBeTruthy();
  });

  describe('import path', () => {
    it('stages a picked file without starting the parse until "Start import" is clicked', async () => {
      const { container } = render(<CampaignCreationGate onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);

      // Staged, not reading — the file is shown but nothing has been sent yet.
      expect(await screen.findByText('notes.txt')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start import' })).toBeTruthy();
      expect(extractClientSide).not.toHaveBeenCalled();
      expect(submitDocument).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));
      await waitFor(() => expect(submitDocument).toHaveBeenCalledTimes(1));
    });

    it('rejects an oversized file at pick time — never stages it or parses', async () => {
      const { container } = render(<CampaignCreationGate onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container, { name: 'huge.pdf', size: 5 * 1024 * 1024 });

      expect(await screen.findByText(/imports are limited to 2 MB/)).toBeTruthy();
      // Stayed on the drop screen — no "Start import", no file read.
      expect(screen.queryByRole('button', { name: 'Start import' })).toBeNull();
      expect(extractClientSide).not.toHaveBeenCalled();
    });

    it('"Choose a different file" from the staged screen discards it without ever parsing', async () => {
      const { container } = render(<CampaignCreationGate onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);
      expect(await screen.findByText('notes.txt')).toBeTruthy();

      fireEvent.click(screen.getByText('Choose a different file'));
      expect(screen.getByText(/Drop a file here/)).toBeTruthy();
      expect(submitDocument).not.toHaveBeenCalled();
    });

    it('reaches the ready screen with parsed content only after starting the import', async () => {
      submitDocument.mockResolvedValue({ summary: 'A tale of two rivals.', actions: [] });
      const { container } = render(<CampaignCreationGate onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);
      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create campaign' })).toBeTruthy());
      expect((screen.getByDisplayValue('Notes') as HTMLInputElement).value).toBe('Notes');
    });

    it('requests title derivation and prefills the model-derived name + premise over the filename', async () => {
      // The parse streams a title event; the gate must use it, not the filename.
      submitDocument.mockImplementation(async (...args: unknown[]) => {
        const onTitle = args[10] as (t: { name: string; tagline: string }) => void;
        onTitle({ name: 'The Sundering Pact', tagline: 'Two rival houses hire the party for the same heist.' });
        return { summary: 'This document is a set of session notes.', actions: [] };
      });
      const { container } = render(<CampaignCreationGate onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Import from a document'));

      stageAFile(container);
      fireEvent.click(screen.getByRole('button', { name: 'Start import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create campaign' })).toBeTruthy());
      // deriveTitle flag is sent (10th positional arg).
      expect(submitDocument.mock.calls[0][9]).toBe(true);
      // Name + premise come from the derived title, not "Notes" / "This document…".
      expect((screen.getByDisplayValue('The Sundering Pact') as HTMLInputElement).value).toBe('The Sundering Pact');
      expect((screen.getByDisplayValue('Two rival houses hire the party for the same heist.') as HTMLTextAreaElement).value)
        .toBe('Two rival houses hire the party for the same heist.');
    });
  });
});
