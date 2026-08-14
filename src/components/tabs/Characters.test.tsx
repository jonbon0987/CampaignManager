import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makePC, makeNPC, makeFaction } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
vi.mock('../../context/StatBlockPanelContext', () => ({ useStatBlockPanel: () => ({ openStatBlock: vi.fn() }) }));
vi.mock('./CharacterWeb', () => ({ default: () => <div>CHARACTER_WEB</div> }));

import Characters from './Characters';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.confirm.value = makeConfirm(true);
});

describe('Characters (cast list)', () => {
  it('shows the empty list + detail states', () => {
    render(<Characters viewMode="list" />);
    expect(screen.getByText('No entries match your filters')).toBeTruthy();
    expect(screen.getByText('Select an entry from the list')).toBeTruthy();
  });

  it('merges PCs, NPCs, and factions into one list', () => {
    h.campaign.value = makeCampaignContext({
      pcs: [makePC({ id: 'p1', character_name: 'Thorin' })],
      npcs: [makeNPC({ id: 'n1', name: 'Kutter' })],
      factions: [makeFaction({ id: 'f1', name: 'The Guild' })],
    });
    render(<Characters viewMode="list" />);
    expect(screen.getByText('Thorin')).toBeTruthy();
    expect(screen.getByText('Kutter')).toBeTruthy();
    expect(screen.getByText('The Guild')).toBeTruthy();
  });

  it('filters the list to a single kind', () => {
    h.campaign.value = makeCampaignContext({
      pcs: [makePC({ id: 'p1', character_name: 'Thorin' })],
      npcs: [makeNPC({ id: 'n1', name: 'Kutter' })],
      factions: [makeFaction({ id: 'f1', name: 'The Guild' })],
    });
    render(<Characters viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'Factions' }));
    expect(screen.getByText('The Guild')).toBeTruthy();
    expect(screen.queryByText('Thorin')).toBeNull();
    expect(screen.queryByText('Kutter')).toBeNull();
  });

  it('adds a PC when the PC filter is active', async () => {
    h.campaign.value = makeCampaignContext({ upsertPC: vi.fn().mockResolvedValue({ id: 'new-pc' }) });
    render(<Characters viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'PCs' }));
    fireEvent.click(screen.getByRole('button', { name: '+ PC' }));
    expect(cc().upsertPC).toHaveBeenCalledWith({ character_name: '', is_active: true, faction_ids: [] });
  });

  it('renders the web view when viewMode is "web"', () => {
    render(<Characters viewMode="web" />);
    expect(screen.getByText('CHARACTER_WEB')).toBeTruthy();
  });
});
