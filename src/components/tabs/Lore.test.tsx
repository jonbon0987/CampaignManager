import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeConfirm } from '../../test/contextMocks';
import { makeLoreEntry } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  world: { value: null as ReturnType<typeof makeWorldContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));

import Lore from './Lore';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.world.value = makeWorldContext();
  h.confirm.value = makeConfirm(true);
});

describe('Lore', () => {
  it('renders the tab with a zero count when empty', () => {
    render(<Lore />);
    expect(screen.getByText('Lore')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Lore' })).toBeTruthy();
  });

  it('creates a blank lore entry via the add button', () => {
    render(<Lore />);
    fireEvent.click(screen.getByRole('button', { name: '+ Lore' }));
    expect(cc().upsertLore).toHaveBeenCalledWith({ title: '', category: null, content: null, dm_only: false, world_id: null });
  });

  it('opens the world-import drawer from the header button', () => {
    const onImportFromWorld = vi.fn();
    render(<Lore onImportFromWorld={onImportFromWorld} />);
    fireEvent.click(screen.getByRole('button', { name: '⊕ Import Lore' }));
    expect(onImportFromWorld).toHaveBeenCalled();
  });

  it('hides the import button when no import handler is provided', () => {
    render(<Lore />);
    expect(screen.queryByRole('button', { name: '⊕ Import Lore' })).toBeNull();
  });

  it('defaults to the first entry when no openId is given', () => {
    h.campaign.value = makeCampaignContext({
      lore: [
        makeLoreEntry({ id: 'l1', title: 'The First Flame' }),
        makeLoreEntry({ id: 'l2', title: 'Borrowed Relic' }),
      ],
    });
    render(<Lore />);
    expect((screen.getByPlaceholderText('Entry title…') as HTMLInputElement).value).toBe('The First Flame');
  });

  it('opens the record named by openId (not the first), then clears the request', () => {
    h.campaign.value = makeCampaignContext({
      lore: [
        makeLoreEntry({ id: 'l1', title: 'The First Flame' }),
        makeLoreEntry({ id: 'l2', title: 'Borrowed Relic' }),
      ],
    });
    const onOpenConsumed = vi.fn();
    render(<Lore openId="l2" onOpenConsumed={onOpenConsumed} />);
    // The detail pane shows l2, the requested record — not the default first entry.
    expect((screen.getByPlaceholderText('Entry title…') as HTMLInputElement).value).toBe('Borrowed Relic');
    // The request is consumed so it doesn't re-fire and pin the selection.
    expect(onOpenConsumed).toHaveBeenCalled();
  });

  it('lists entries and marks canon-linked ones as imported', () => {
    h.campaign.value = makeCampaignContext({
      lore: [
        makeLoreEntry({ id: 'l1', title: 'The First Flame', category: 'history' }),
        makeLoreEntry({ id: 'l2', title: 'Borrowed Relic', category: 'artifact' }),
      ],
      linkedLoreIds: ['l2'],
    });
    render(<Lore />);
    expect(screen.getByText('The First Flame')).toBeTruthy();
    expect(screen.getByText('Borrowed Relic')).toBeTruthy();
    // the linked entry carries the "imported" origin badge; the local one "only here"
    expect(screen.getByText('imported')).toBeTruthy();
    expect(screen.getByText('only here')).toBeTruthy();
  });
});
