import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampaignCreationGate from './CampaignCreationGate';

const { createCampaign, openCampaign, seedCampaignHooks } = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  openCampaign: vi.fn(),
  seedCampaignHooks: vi.fn(),
}));

vi.mock('../../context/WorldContext', () => ({
  useWorld: () => ({ createCampaign, openCampaign, activeWorld: { name: 'Test World' } }),
}));

// Keep templates/helpers real, but stub the DB-touching hook seeder.
vi.mock('../../lib/campaignSeeds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/campaignSeeds')>();
  return { ...actual, seedCampaignHooks };
});

beforeEach(() => {
  vi.clearAllMocks();
  createCampaign.mockResolvedValue({ id: 'c1', worldId: 'w1', name: 'X', sessions: 0, party: '', lastPlayed: '', status: 'active' });
  seedCampaignHooks.mockResolvedValue(undefined);
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
});
