import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeConfirm } from '../../test/contextMocks';
import { makePC, makeNPC, makeFaction } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  world: { value: null as ReturnType<typeof makeWorldContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
vi.mock('../../context/StatBlockPanelContext', () => ({ useStatBlockPanel: () => ({ openStatBlock: vi.fn() }) }));
vi.mock('./CharacterWeb', () => ({ default: () => <div>CHARACTER_WEB</div> }));
vi.mock('../session/SessionHistory', () => ({ SessionHistory: () => null }));
vi.mock('../session/SessionUpdateBand', () => ({ SessionUpdateBand: () => null }));

import Characters from './Characters';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.world.value = makeWorldContext();
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
    fireEvent.click(screen.getByRole('button', { name: '+ Add PC' }));
    expect(cc().upsertPC).toHaveBeenCalledWith({ character_name: '', is_active: true, faction_ids: [] });
  });

  it('renders the web view when viewMode is "web"', () => {
    render(<Characters viewMode="web" />);
    expect(screen.getByText('CHARACTER_WEB')).toBeTruthy();
  });

  describe('canon provenance', () => {
    // The editor's fields sit in a fieldset, disabled while the entry is locked.
    const locked = () => (screen.getByLabelText('Name').closest('fieldset') as HTMLFieldSetElement).disabled;

    it('badges an NPC linked from world canon as "imported", but not a local one', () => {
      h.campaign.value = makeCampaignContext({
        npcs: [makeNPC({ id: 'n1', name: 'Canon Kutter' }), makeNPC({ id: 'n2', name: 'Local Marta' })],
        linkedNPCIds: ['n1'],
      });
      render(<Characters viewMode="list" />);
      // Exactly one "imported" badge — on the linked NPC.
      expect(screen.getAllByText('imported')).toHaveLength(1);
    });

    it('opens an imported NPC locked, so a change can’t reach every campaign by accident', () => {
      h.campaign.value = makeCampaignContext({
        npcs: [makeNPC({ id: 'n1', name: 'Canon Kutter' })],
        linkedNPCIds: ['n1'],
      });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Canon Kutter'));
      expect(screen.getByText('World canon · locked')).toBeTruthy();
      expect(locked()).toBe(true);

      fireEvent.click(screen.getByText('Edit canon'));
      expect(screen.getByText('Imported from world canon')).toBeTruthy();
      expect(locked()).toBe(false);
    });

    it('never locks a campaign-local NPC', () => {
      h.campaign.value = makeCampaignContext({ npcs: [makeNPC({ id: 'n2', name: 'Local Marta' })], linkedNPCIds: [] });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Local Marta'));
      expect(locked()).toBe(false);
    });

    it('shows the "Created for this table" band for a campaign-local NPC', () => {
      h.campaign.value = makeCampaignContext({
        npcs: [makeNPC({ id: 'n2', name: 'Local Marta' })],
        linkedNPCIds: [],
      });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Local Marta'));
      expect(screen.getByText('Created for this table')).toBeTruthy();
    });

    it('detaches a linked NPC via the origin band', () => {
      const unlink = vi.fn().mockResolvedValue(undefined);
      h.campaign.value = makeCampaignContext({
        npcs: [makeNPC({ id: 'n1', name: 'Canon Kutter' })],
        linkedNPCIds: ['n1'],
        unlinkNPCFromCampaign: unlink,
      });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Canon Kutter'));
      fireEvent.click(screen.getByText('Detach copy'));
      expect(unlink).toHaveBeenCalledWith('n1');
    });
  });
});
