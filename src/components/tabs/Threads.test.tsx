import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Hook } from '../../lib/database.types';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeHook } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
// The description editor pulls in EntityRefContext; stub it to a plain textarea.
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="summary" value={value ?? ''} onChange={e => onChange(e.target.value)} />
  ),
}));

import Threads from './Threads';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.confirm.value = makeConfirm(true);
});

describe('Threads', () => {
  it('summarizes live vs total counts (resolved is not live)', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [
        makeHook({ id: 'a', title: 'A', state: 'seed' }),
        makeHook({ id: 'b', title: 'B', state: 'active' }),
        makeHook({ id: 'c', title: 'C', state: 'resolved', is_active: false }),
      ],
    });
    render(<Threads />);
    expect(screen.getByText(/2 live · 3 total/)).toBeTruthy();
  });

  it('shows the empty state when there are no threads', () => {
    render(<Threads />);
    expect(screen.getByText('No threads yet. Promote an idea or add one.')).toBeTruthy();
  });

  it('filters the board by search text', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [makeHook({ id: 'a', title: 'The Seventh Shard' }), makeHook({ id: 'b', title: 'Missing Caravan' })],
    });
    render(<Threads />);
    expect(screen.getByText('Missing Caravan')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search threads…'), { target: { value: 'shard' } });
    expect(screen.getByText('The Seventh Shard')).toBeTruthy();
    expect(screen.queryByText('Missing Caravan')).toBeNull();
  });

  it('creates a new thread from the modal', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'x', title: 'Existing' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: /New Thread/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g., The Seventh Shard'), { target: { value: 'The Heist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(cc().upsertHook).toHaveBeenCalledWith(
      expect.objectContaining({ id: undefined, title: 'The Heist', category: 'side_quest', state: 'seed', is_active: true }),
    );
  });

  it('edits an existing thread (preserves its id)', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'Old title', state: 'active' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., The Seventh Shard'), { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', title: 'New title' }));
  });

  it('changes a thread lifecycle state inline', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T', state: 'seed' })] });
    render(<Threads />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } });
    expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', state: 'resolved', is_active: false }));
  });

  it('deletes a thread after confirmation', async () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    await waitFor(() => expect(cc().deleteHook).toHaveBeenCalledWith('h1'));
  });
});
