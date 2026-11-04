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

// A list row's title; the open record's title field holds the same text.
const ROW = { selector: '.cm-row-title' };

describe('Characters (cast list)', () => {
  it('shows one empty state, with a way to add the first character, when the cast is empty', () => {
    render(<Characters viewMode="list" />);
    expect(screen.getByText(/No one in the cast yet/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('merges PCs, NPCs, and factions into one list', () => {
    h.campaign.value = makeCampaignContext({
      pcs: [makePC({ id: 'p1', character_name: 'Thorin' })],
      npcs: [makeNPC({ id: 'n1', name: 'Kutter' })],
      factions: [makeFaction({ id: 'f1', name: 'The Guild' })],
    });
    render(<Characters viewMode="list" />);
    expect(screen.getByText('Thorin', ROW)).toBeTruthy();
    expect(screen.getByText('Kutter', ROW)).toBeTruthy();
    expect(screen.getByText('The Guild', ROW)).toBeTruthy();
  });

  it('filters the list to a single kind', () => {
    h.campaign.value = makeCampaignContext({
      pcs: [makePC({ id: 'p1', character_name: 'Thorin' })],
      npcs: [makeNPC({ id: 'n1', name: 'Kutter' })],
      factions: [makeFaction({ id: 'f1', name: 'The Guild' })],
    });
    render(<Characters viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'Factions' }));
    expect(screen.getByText('The Guild', ROW)).toBeTruthy();
    expect(screen.queryByText('Thorin', ROW)).toBeNull();
    expect(screen.queryByText('Kutter', ROW)).toBeNull();
  });

  it('adds a PC from the empty state', async () => {
    h.campaign.value = makeCampaignContext({ upsertPC: vi.fn().mockResolvedValue({ id: 'new-pc' }) });
    render(<Characters viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a player character' }));
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
      fireEvent.click(screen.getByText('Canon Kutter', ROW));
      expect(screen.getByText('World canon · locked')).toBeTruthy();
      expect(locked()).toBe(true);

      fireEvent.click(screen.getByText('Edit canon'));
      expect(screen.getByText('Imported from world canon')).toBeTruthy();
      expect(locked()).toBe(false);
    });

    it('never locks a campaign-local NPC', () => {
      h.campaign.value = makeCampaignContext({ npcs: [makeNPC({ id: 'n2', name: 'Local Marta' })], linkedNPCIds: [] });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Local Marta', ROW));
      expect(locked()).toBe(false);
    });

    it('shows the "Created for this table" band for a campaign-local NPC', () => {
      h.campaign.value = makeCampaignContext({
        npcs: [makeNPC({ id: 'n2', name: 'Local Marta' })],
        linkedNPCIds: [],
      });
      render(<Characters viewMode="list" />);
      fireEvent.click(screen.getByText('Local Marta', ROW));
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
      fireEvent.click(screen.getByText('Canon Kutter', ROW));
      fireEvent.click(screen.getByText('Detach copy'));
      expect(unlink).toHaveBeenCalledWith('n1');
    });
  });
});
