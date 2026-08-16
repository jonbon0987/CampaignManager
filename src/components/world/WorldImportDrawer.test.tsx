import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext } from '../../test/contextMocks';
import WorldImportDrawer from './WorldImportDrawer';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  world: { value: null as ReturnType<typeof makeWorldContext> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));

const cc = () => h.campaign.value!;

const npc = (id: string, name: string) => ({ id, name, role: 'Merchant', description: 'A canon NPC.', status: 'active', faction_ids: ['wf1'], statblock_id: 'ws1', world_id: 'w1', campaign_id: null });

beforeEach(() => {
  h.campaign.value = makeCampaignContext({
    globalNPCs: [npc('n1', 'Aldric'), npc('n2', 'Marta')],
    linkedNPCIds: ['n2'],
    linkNPCToCampaign: vi.fn().mockResolvedValue(undefined),
    upsertNPC: vi.fn().mockResolvedValue({ id: 'new' }),
    upsertMonsterStatblock: vi.fn().mockResolvedValue({ id: 'sb' }),
  });
  h.world.value = makeWorldContext({
    bestiary: [{ id: 'b1', name: 'Dire Rat', cr: '1/4', type: 'beast', hp: 7, ac: 12, desc: 'A big rat.', tags: ['beast'] }],
  });
});

const importBtn = (c: HTMLElement) => c.querySelector('.wi-import-btn') as HTMLButtonElement;

describe('WorldImportDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<WorldImportDrawer open={false} onClose={vi.fn()} entityType="npc" />);
    expect(container.querySelector('.wi-drawer')).toBeNull();
  });

  it('lists the canon NPC pool and marks already-linked entries', () => {
    render(<WorldImportDrawer open onClose={vi.fn()} entityType="npc" />);
    expect(screen.getByText('Aldric')).toBeTruthy();
    expect(screen.getByText('Marta')).toBeTruthy();
    expect(screen.getByText(/linked/)).toBeTruthy(); // n2 is linked
  });

  it('clears the staged selection when closed (via the ✕)', () => {
    const onClose = vi.fn();
    render(<WorldImportDrawer open onClose={onClose} entityType="npc" />);
    fireEvent.click(screen.getByText('Aldric'));
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalled();
    // The selection is reset synchronously, so a reopen starts fresh.
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('links a selected NPC in Link mode (default)', async () => {
    const onClose = vi.fn();
    const { container } = render(<WorldImportDrawer open onClose={onClose} entityType="npc" />);
    fireEvent.click(screen.getByText('Aldric'));
    fireEvent.click(importBtn(container));
    await waitFor(() => expect(cc().linkNPCToCampaign).toHaveBeenCalledWith('n1'));
    expect(cc().upsertNPC).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('copies a selected NPC as a campaign-scoped record in Copy mode', async () => {
    const { container } = render(<WorldImportDrawer open onClose={vi.fn()} entityType="npc" />);
    fireEvent.click(screen.getByRole('radio', { name: /Copy/ }));
    fireEvent.click(screen.getByText('Aldric'));
    fireEvent.click(importBtn(container));
    await waitFor(() => expect(cc().upsertNPC).toHaveBeenCalledTimes(1));
    const [payload, scope] = (cc().upsertNPC as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(scope).toBe('campaign');
    expect(payload).toMatchObject({ name: 'Aldric', faction_ids: [], statblock_id: null });
    // System fields from the canon row must not carry over into the new record.
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('campaign_id');
    expect(cc().linkNPCToCampaign).not.toHaveBeenCalled();
  });

  it('offers copy-only (no Link/Copy toggle) for stat blocks and copies them', async () => {
    const { container } = render(<WorldImportDrawer open onClose={vi.fn()} entityType="bestiary" />);
    // Copy-only kinds hide the mode toggle entirely.
    expect(screen.queryByRole('radio', { name: /Link/ })).toBeNull();
    fireEvent.click(screen.getByText('Dire Rat'));
    fireEvent.click(importBtn(container));
    await waitFor(() => expect(cc().upsertMonsterStatblock).toHaveBeenCalledTimes(1));
    expect((cc().upsertMonsterStatblock as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toMatchObject({ name: 'Dire Rat', challenge_rating: '1/4', hit_points: 7, armor_class: 12 });
  });
});
