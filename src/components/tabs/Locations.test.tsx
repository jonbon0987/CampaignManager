import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeConfirm } from '../../test/contextMocks';
import { makeLocation } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  world: { value: null as ReturnType<typeof makeWorldContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));

import Locations from './Locations';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.world.value = makeWorldContext();
  h.confirm.value = makeConfirm(true);
});

describe('Locations', () => {
  it('shows the inline empty message and a top-level add button', () => {
    render(<Locations />);
    expect(screen.getByText('No places yet — create one or import from canon')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Location' })).toBeTruthy();
  });

  it('adds a root landmark via the add button', () => {
    render(<Locations />);
    fireEvent.click(screen.getByRole('button', { name: '+ Location' }));
    expect(cc().upsertLocation).toHaveBeenCalledWith(
      expect.objectContaining({ name: '', location_type: 'landmark', parent_id: null }),
    );
  });

  it('opens the world-import drawer from the header button', () => {
    const onImportFromWorld = vi.fn();
    render(<Locations onImportFromWorld={onImportFromWorld} />);
    fireEvent.click(screen.getByRole('button', { name: '⊕ Import Location' }));
    expect(onImportFromWorld).toHaveBeenCalled();
  });

  it('renders the location tree and collapses a parent to hide its children', () => {
    h.campaign.value = makeCampaignContext({
      locations: [
        makeLocation({ id: 'p', name: 'Saltmarsh', parent_id: null, location_type: 'city' }),
        makeLocation({ id: 'c', name: 'The Docks', parent_id: 'p', location_type: 'landmark' }),
      ],
    });
    render(<Locations />);
    expect(screen.getByText('The Docks')).toBeTruthy(); // child visible while expanded

    fireEvent.click(screen.getByRole('button', { name: '▾' })); // collapse the parent
    expect(screen.queryByText('The Docks')).toBeNull();
  });
});
