import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Faction, Location, NPC } from '../../lib/database.types';

const h = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly?: boolean }) => (
    <textarea aria-label="rich text" value={value ?? ''} readOnly={readOnly} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('../session/SessionHistory', () => ({ SessionHistory: () => <div>Session history list</div> }));
vi.mock('../session/SessionUpdateBand', () => ({ SessionUpdateBand: () => null }));

import { NPCEditor } from './NPCEditor';
import { FactionEditor } from './FactionEditor';
import { LocationEditor } from './LocationEditor';

const npc = (over: Partial<NPC> = {}) => ({
  id: 'n1', name: 'Brenna', role: 'Harbormaster', affiliation: null, status: 'active', disposition: null, description: 'Tall.',
  hooks_motivations: null, dm_notes: null, location: null, first_session: null, met_by_pcs: false, faction_ids: [], statblock_id: null,
  world_id: 'w1', ...over,
}) as NPC;
const faction = (over: Partial<Faction> = {}) => ({ id: 'f1', name: 'The Grey Hand', faction_type: 'criminal', overview: null, key_figures: null, agenda: null, dm_notes: null, ...over }) as Faction;
const place = (id: string, parent_id: string | null = null) => ({ id, name: id, parent_id, region: null, location_type: 'town', population: null, status: null, description: null, history: null, dm_notes: null }) as Location;

beforeEach(() => { h.confirm.mockReset().mockResolvedValue(true); });

describe('NPCEditor', () => {
  it('keeps empty optional sections in an Add row until asked for', () => {
    render(<NPCEditor npc={npc()} scope="world" factions={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.queryByText('DM notes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ DM notes' }));
    expect(screen.getByText('DM notes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ DM notes' })).toBeNull();
  });

  it('shows sections that have something in them', () => {
    render(<NPCEditor npc={npc({ hooks_motivations: 'Wants the letter back.' })} scope="world" factions={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByText('Hooks & motivations')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Hooks & motivations' })).toBeNull();
  });

  it('leaves campaign-only parts out of the world', () => {
    render(<NPCEditor npc={npc()} scope="world" factions={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByText('World NPC')).toBeTruthy();
    expect(screen.queryByText('Session history list')).toBeNull();
    expect(screen.queryByLabelText('First session #')).toBeNull();
  });

  it('saves what was typed', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<NPCEditor npc={npc()} scope="campaign" factions={[]} statblocks={[]} save={save} remove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Smuggler' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brenna', role: 'Smuggler' })), { timeout: 2000 });
  });

  it('warns that deleting a canon NPC removes it everywhere', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    render(<NPCEditor npc={npc()} scope="campaign" factions={[]} statblocks={[]} save={vi.fn()} remove={remove}
      canon={{ origin: 'imported', onOpenInCanon: vi.fn(), onPublish: vi.fn(), onDetach: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Delete NPC'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('n1'));
    expect(h.confirm.mock.calls[0][0].message).toMatch(/every campaign/);
  });
});

describe('FactionEditor', () => {
  it('lists the NPCs who belong to it, each opening that NPC', () => {
    const onOpenNPC = vi.fn();
    render(<FactionEditor faction={faction()} scope="world" save={vi.fn()} remove={vi.fn()} onOpenNPC={onOpenNPC}
      npcs={[{ id: 'n1', name: 'Sable Thorne', faction_ids: ['f1'] }, { id: 'n2', name: 'Brenna', faction_ids: [] }]} />);
    expect(screen.queryByText('Brenna')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sable Thorne/ }));
    expect(onOpenNPC).toHaveBeenCalledWith('n1');
  });
});

describe('LocationEditor', () => {
  it('won’t put a place inside itself or anything within it', () => {
    const all = [place('Coast'), place('Port', 'Coast'), place('Docks', 'Port'), place('Inland')];
    render(<LocationEditor location={all[1]} scope="world" allLocations={all} save={vi.fn()} remove={vi.fn()} />);
    const options = [...(screen.getByLabelText('Within') as HTMLSelectElement).options].map(o => o.textContent);
    expect(options).toEqual(['— Top level —', 'Coast', 'Inland']);
  });
});
