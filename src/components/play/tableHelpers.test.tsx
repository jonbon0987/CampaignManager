import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Fight } from '../../lib/combat';
import { makeCampaignContext } from '../../test/contextMocks';

const h = vi.hoisted(() => ({
  campaign: { value: null as Record<string, unknown> | null },
  play: { value: null as Record<string, unknown> | null },
  toast: vi.fn(),
  openRecord: vi.fn(),
  openStatBlock: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/PlayContext', () => ({ usePlay: () => h.play.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.openRecord }));
vi.mock('../../context/StatBlockPanelContext', () => ({ useStatBlockPanel: () => ({ openStatBlock: h.openStatBlock }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));

import { PlayScene } from './PlayScene';
import { PlayImprov } from './PlayImprov';
import { PlayInitiative } from './PlayInitiative';

const scene = (id: string, title: string, over: Record<string, unknown> = {}) =>
  ({ id, title, submodule_id: 'sub1', summary: null, read_aloud: null, linked_monster_ids: null, ...over });

beforeEach(() => {
  h.toast.mockReset();
  h.openRecord.mockReset();
  h.openStatBlock.mockReset();
});

describe('PlayScene', () => {
  const setScene = vi.fn();
  const live = { id: 's6', plan: { scene_ids: ['a', 'b'] } };
  beforeEach(() => {
    setScene.mockReset();
    h.campaign.value = makeCampaignContext({
      scenes: [scene('a', 'The Crushing Hallway', { read_aloud: 'Water drips from the vaulted ceiling.', linked_monster_ids: '["m1"]' }), scene('b', 'The Vault')],
      submodules: [{ id: 'sub1', module_id: 'mod1', title: 'The Sunken Vaults' }],
      modules: [{ id: 'mod1', title: 'The Sunken Crown' }],
      monsterStatblocks: [{ id: 'm1', name: 'Shattered Vanguard', challenge_rating: '2' }],
      loadModuleTree: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('shows the scene in play with its read-aloud large', () => {
    h.play.value = { live, play: { scene_id: 'a' }, setScene };
    render(<PlayScene />);
    expect(screen.getByText('The Crushing Hallway')).toBeTruthy();
    expect(screen.getByText(/scene 1 of 2/)).toBeTruthy();
    expect(screen.getByText('Water drips from the vaulted ceiling.').closest('.ra')?.className).toContain('is-large');
    fireEvent.click(screen.getByRole('button', { name: /Shattered Vanguard/ }));
    expect(h.openStatBlock).toHaveBeenCalledWith('m1');
  });

  it('steps through the agenda', () => {
    h.play.value = { live, play: { scene_id: 'a' }, setScene };
    render(<PlayScene />);
    expect((screen.getByRole('button', { name: '‹ Previous' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next ›' }));
    expect(setScene).toHaveBeenCalledWith('b');
  });

  it('says when a scene has no read-aloud text', () => {
    h.play.value = { live, play: { scene_id: 'b' }, setScene };
    render(<PlayScene />);
    expect(screen.getByText(/No read-aloud text for this scene/)).toBeTruthy();
  });

  it('offers the agenda when no scene is picked yet', () => {
    h.play.value = { live, play: { scene_id: null }, setScene };
    render(<PlayScene />);
    fireEvent.click(screen.getByRole('button', { name: /The Vault/ }));
    expect(setScene).toHaveBeenCalledWith('b');
  });
});

describe('PlayImprov', () => {
  const addNote = vi.fn();
  beforeEach(() => {
    addNote.mockReset();
    h.play.value = { addNote };
    h.campaign.value = makeCampaignContext({
      upsertIdea: vi.fn().mockResolvedValue(undefined),
      randomEncounterTables: [{ id: 't1', name: 'Docks at night', die_size: 6, entries: JSON.stringify([{ id: 'e1', name: 'A drunk sailor', description: 'Wants to sell a map.', weight: 1, rarity: null }]) }],
    });
  });

  it('sends a quick NPC to the Inbox to flesh out later', async () => {
    render(<PlayImprov />);
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Wren Testwood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to the Inbox' }));
    await waitFor(() => expect(h.campaign.value!.upsertIdea).toHaveBeenCalledWith(expect.objectContaining({ tag: 'npc', text: expect.stringMatching(/^Wren Testwood, /) })));
    expect(h.toast).toHaveBeenCalledWith('Wren Testwood is in the Inbox', 'success');
  });

  it('gives the quick NPC a name picked from the list', () => {
    render(<PlayImprov />);
    const first = screen.getAllByTitle('Use for the quick NPC')[0];
    fireEvent.click(first);
    expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe(first.textContent);
  });

  it('rolls a random table inline, and notes the result', () => {
    render(<PlayImprov />);
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(screen.getByText('A drunk sailor')).toBeTruthy();
    expect(screen.getByText(/d6 →/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Note it' }).at(-1)!);
    expect(addNote).toHaveBeenCalledWith('Rolled A drunk sailor on Docks at night');
  });
});

describe('PlayInitiative', () => {
  const caster = {
    id: 'c1', name: 'Mage', initiative: 15, dexMod: 2, maxHp: 30, currentHp: 18, temp: 0, deathSaves: { s: 0, f: 0 }, ac: 12,
    conditions: ['concentrating', 'frightened'], rounds: { frightened: 2 }, conCheck: 12, isPC: false, statblockId: null, notes: null,
  };

  it('asks for the concentration save after damage, and ends the spell if it’s lost', () => {
    let fight: Fight = { combatants: [caster] as Fight['combatants'], turn: 0, round: 2, expired: [{ name: 'Goblin', conditions: ['prone'] }] };
    const setFight = vi.fn((f: Fight | ((prev: Fight) => Fight)) => { fight = typeof f === 'function' ? f(fight) : f; });
    h.campaign.value = makeCampaignContext();
    h.play.value = { fight, setFight };
    render(<PlayInitiative />);
    expect(screen.getByRole('alert').textContent).toContain('DC 12');
    expect(screen.getByText('Goblin is no longer prone')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear frightened' }).title).toMatch(/2 rounds left/);
    fireEvent.click(screen.getByRole('button', { name: 'Lost' }));
    expect(fight.combatants[0]).toMatchObject({ conCheck: null, conditions: ['frightened'] });
  });
});
