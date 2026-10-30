import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Faction, Location, MonsterStatblock, NPC, PlayerCharacter } from '../../lib/database.types';

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
import { PCEditor } from './PCEditor';
import { StatSheetEditor } from './StatSheetEditor';

const npc = (over: Partial<NPC> = {}) => ({
  id: 'n1', name: 'Brenna', role: 'Harbormaster', affiliation: null, status: 'active', disposition: null, description: 'Tall.',
  hooks_motivations: null, dm_notes: null, location: null, location_id: null, first_session: null, met_by_pcs: false, faction_ids: [], statblock_id: null,
  world_id: 'w1', ...over,
}) as NPC;
const faction = (over: Partial<Faction> = {}) => ({ id: 'f1', name: 'The Grey Hand', faction_type: 'criminal', overview: null, key_figures: null, key_figure_ids: [], agenda: null, dm_notes: null, ...over }) as Faction;
const pc = (over: Partial<PlayerCharacter> = {}) => ({
  id: 'p1', character_name: 'Kael', player_name: 'Sam', race: null, class: null, background: null, story_hooks: null,
  key_npcs: null, key_npc_ids: [], dm_notes: null, is_active: true, faction_ids: [], statblock_id: null, level: 5, max_hp: null, armor_class: null, ...over,
}) as PlayerCharacter;
const place = (id: string, parent_id: string | null = null) => ({ id, name: id, parent_id, region: null, location_type: 'town', population: null, status: null, description: null, history: null, dm_notes: null }) as Location;

beforeEach(() => { h.confirm.mockReset().mockResolvedValue(true); });

describe('NPCEditor', () => {
  it('keeps empty optional sections in an Add row until asked for', () => {
    render(<NPCEditor npc={npc()} scope="world" factions={[]} locations={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.queryByText('DM notes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ DM notes' }));
    expect(screen.getByText('DM notes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ DM notes' })).toBeNull();
  });

  it('shows sections that have something in them', () => {
    render(<NPCEditor npc={npc({ hooks_motivations: 'Wants the letter back.' })} scope="world" factions={[]} locations={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByText('Hooks & motivations')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Hooks & motivations' })).toBeNull();
  });

  it('leaves campaign-only parts out of the world', () => {
    render(<NPCEditor npc={npc()} scope="world" factions={[]} locations={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByText('World NPC')).toBeTruthy();
    expect(screen.queryByText('Session history list')).toBeNull();
    expect(screen.queryByLabelText('First session #')).toBeNull();
  });

  it('saves what was typed', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<NPCEditor npc={npc()} scope="campaign" factions={[]} locations={[]} statblocks={[]} save={save} remove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Smuggler' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brenna', role: 'Smuggler' })), { timeout: 2000 });
  });

  it('warns that deleting a canon NPC removes it everywhere', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    render(<NPCEditor npc={npc()} scope="campaign" factions={[]} locations={[]} statblocks={[]} save={vi.fn()} remove={remove}
      canon={{ origin: 'imported', onOpenInCanon: vi.fn(), onPublish: vi.fn(), onDetach: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Delete NPC'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('n1'));
    expect(h.confirm.mock.calls[0][0].message).toMatch(/every campaign/);
  });

  it('links the place the NPC is found, and keeps the old text beside it until cleared', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onOpenLocation = vi.fn();
    render(<NPCEditor npc={npc({ location: 'Down at the docks', location_id: 'l1' })} scope="campaign" factions={[]} statblocks={[]}
      locations={[{ id: 'l1', name: 'Saltmarsh Docks', region: null }]} onOpenLocation={onOpenLocation} save={save} remove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saltmarsh Docks' }));
    expect(onOpenLocation).toHaveBeenCalledWith('l1');
    expect(screen.getByText('“Down at the docks”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('“Down at the docks”')).toBeNull();
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ location: null, location_id: 'l1' })), { timeout: 2000 });
  });

  it('unlinks a place', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<NPCEditor npc={npc({ location_id: 'l1' })} scope="campaign" factions={[]} statblocks={[]}
      locations={[{ id: 'l1', name: 'Saltmarsh Docks', region: null }]} save={save} remove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Saltmarsh Docks' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ location_id: null })), { timeout: 2000 });
  });

  it('shows the affiliation it was typed with beside its factions', () => {
    render(<NPCEditor npc={npc({ affiliation: 'Runs with the Hand' })} scope="campaign" factions={[]} locations={[]} statblocks={[]} save={vi.fn()} remove={vi.fn()} />);
    expect(screen.getByText('“Runs with the Hand”')).toBeTruthy();
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

  it('links its key figures, and adds one from the NPCs', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<FactionEditor faction={faction({ key_figure_ids: ['n1'] })} scope="world" save={save} remove={vi.fn()}
      npcs={[{ id: 'n1', name: 'Sable Thorne', role: null, faction_ids: [] }, { id: 'n2', name: 'Brenna', role: 'Harbormaster', faction_ids: [] }]} />);
    expect(screen.getByText('Sable Thorne')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Add a key figure' }));
    fireEvent.click(screen.getByRole('button', { name: /Brenna/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ key_figure_ids: ['n1', 'n2'] })), { timeout: 2000 });
  });
});

describe('PCEditor', () => {
  const npcs = [{ id: 'n1', name: 'Sable Thorne', role: 'Fence' }];

  it('links key NPCs, each opening that NPC, and names one since deleted', () => {
    const onOpenNPC = vi.fn();
    render(<PCEditor pc={pc({ key_npc_ids: ['n1', 'gone'] })} factions={[]} npcs={npcs} statblocks={[]} save={vi.fn()} remove={vi.fn()} onOpenNPC={onOpenNPC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sable Thorne' }));
    expect(onOpenNPC).toHaveBeenCalledWith('n1');
    expect(screen.getByText('A deleted entry')).toBeTruthy();
  });

  it('keeps the key NPCs it was typed with beside the links, and saves an unlink', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<PCEditor pc={pc({ key_npcs: 'Sable, an old friend', key_npc_ids: ['n1'] })} factions={[]} npcs={npcs} statblocks={[]} save={save} remove={vi.fn()} />);
    expect(screen.getByText('“Sable, an old friend”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Sable Thorne' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ key_npc_ids: [], key_npcs: 'Sable, an old friend' })), { timeout: 2000 });
  });

  it('edits level, HP and AC', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<PCEditor pc={pc()} factions={[]} npcs={[]} statblocks={[]} save={save} remove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '6' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ level: 6 })), { timeout: 2000 });
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

describe('StatSheetEditor', () => {
  const sheet = (over: Partial<MonsterStatblock> = {}) => ({
    id: 's1', name: 'Ghoul', creature_type: 'undead', challenge_rating: '1', armor_class: 12, ac_descriptor: null, hit_points: 22, hit_dice: null,
    speed: '30 ft.', str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6, saving_throws: null, skills: null, damage_immunities: 'poison',
    damage_resistances: null, condition_immunities: null, senses: null, languages: null, content: null, dm_notes: null, tags: null, sort_order: 0,
    ...over,
  }) as MonsterStatblock;

  it('saves as you type, numbers as numbers', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<StatSheetEditor statblock={sheet()} scope="campaign" save={save} remove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Hit points'), { target: { value: '30' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ghoul', hit_points: 30, armor_class: 12, damage_immunities: 'poison' })), { timeout: 2000 });
  });

  it('opens the sheet in the rail once the last edit is saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onView = vi.fn();
    render(<StatSheetEditor statblock={sheet()} scope="world" save={save} remove={vi.fn()} onView={onView} />);
    expect(screen.getByText('World stat sheet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View sheet' }));
    await waitFor(() => expect(onView).toHaveBeenCalled());
    expect(save).toHaveBeenCalled();
  });

  it('deletes after the DM confirms', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(<StatSheetEditor statblock={sheet()} scope="campaign" save={vi.fn()} remove={remove} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Delete stat sheet'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('s1'));
    expect(onDeleted).toHaveBeenCalled();
  });
});
