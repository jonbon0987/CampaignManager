// Covers the campaign assistant's submodule/scene write path: resolving a
// parent that is either already in the campaign or is being created in the
// same batch, appending sort_order, and failing legibly when a parent hasn't
// been committed yet.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeCampaignContext } from '../test/contextMocks';
import { makeModule, makeSubmodule, makeScene, makeNPC, makePC, makeSession, makeHook, makeLocation } from '../test/fixtures';
import type { PendingAction } from './useAIChat';
import type { ItemsValue } from '../context/items';
import type { Item, ItemHolding, TreasuryEntry } from '../lib/database.types';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  items: { value: null as ItemsValue | null },
}));
vi.mock('../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../context/WorldContext', () => ({ useWorld: () => ({}) }));
vi.mock('../context/items', () => ({ useItems: () => h.items.value }));

import { useCampaignAssistantBackend } from './assistantBackend';

const cc = () => h.campaign.value!;

let subSeq = 0;
beforeEach(() => {
  subSeq = 0;
  h.items.value = null;
  h.campaign.value = makeCampaignContext({
    selectedCampaign: { id: 'camp-1', name: 'Test' },
    // The parents these tests point at have to actually exist — resolveParent
    // now rejects a module_id/submodule_id that names no real parent rather than
    // passing a garbled id to the DB.
    modules: [makeModule('mod-1')],
    submodules: [makeSubmodule('existing-sub'), makeSubmodule('sub-x')],
    upsertModule: vi.fn().mockResolvedValue({ id: 'mod-new' }),
    upsertSubmodule: vi.fn().mockImplementation(() => Promise.resolve({ id: `sub-${++subSeq}` })),
    upsertScene: vi.fn().mockResolvedValue({ id: 'scene-1' }),
  });
});

const backend = () => renderHook(() => useCampaignAssistantBackend()).result.current;

const submoduleAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertSubmodule', payload } as unknown as PendingAction);
const sceneAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertScene', payload } as unknown as PendingAction);
const npcAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertNPC', payload } as unknown as PendingAction);
const moduleAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertModule', payload } as unknown as PendingAction);

describe('campaign assistant — submodule & scene writes', () => {
  it('writes a submodule against a module id the assistant read from context', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({
      module_id: 'mod-1', title: 'The Dive', submodule_type: 'exploration', summary: 'Down into the wreck.',
    }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({
      module_id: 'mod-1', title: 'The Dive', submodule_type: 'exploration', sort_order: 0,
    }));
  });

  it('hangs a scene off a submodule proposed earlier in the same batch, via its ref', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'dive', title: 'The Dive' }));
    await b.applyChatAction(sceneAction({ submodule_ref: 'dive', title: 'The Wreck', scene_type: 'exploration' }));

    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({
      submodule_id: 'sub-1', title: 'The Wreck', scene_type: 'exploration', sort_order: 0,
    }));
  });

  it('hangs a submodule off a module created earlier in the same batch, via its ref', async () => {
    const b = backend();
    await b.applyChatAction(moduleAction({ chapter: '2', ref: 'heist', title: 'The Heist' }));
    await b.applyChatAction(submoduleAction({ module_ref: 'heist', title: 'Casing the Vault' }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({
      module_id: 'mod-new', title: 'Casing the Vault',
    }));
  });

  it('resolves a ref nickname the assistant mistakenly put in the id field', async () => {
    // `submodule_id: "dive"` names a committed ref, not a real id — resolve it
    // rather than passing "dive" to the DB and tripping a foreign-key error.
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'dive', title: 'The Dive' }));
    await b.applyChatAction(sceneAction({ submodule_id: 'dive', title: 'The Wreck' }));

    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ submodule_id: 'sub-1' }));
  });

  it('prefers a real parent id over a ref when both are present', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'dive', title: 'The Dive' }));
    await b.applyChatAction(sceneAction({ submodule_id: 'existing-sub', submodule_ref: 'dive', title: 'X' }));

    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ submodule_id: 'existing-sub' }));
  });

  it('fails legibly when the module_id names no real module, instead of hitting the DB', async () => {
    // The assistant transcribed the module's UUID wrong (or hallucinated it), so
    // it matches no module and no committed ref. Reject it here rather than let
    // the write trip a foreign-key error against "modules".
    const b = backend();
    await expect(b.applyChatAction(submoduleAction({ module_id: 'not-a-real-module', title: 'Orphan section' })))
      .rejects.toThrow(/isn't in this campaign.*"not-a-real-module".*[Rr]egenerate/);
    expect(cc().upsertSubmodule).not.toHaveBeenCalled();
  });

  it('fails with a message naming the uncommitted parent', async () => {
    const b = backend();
    await expect(b.applyChatAction(sceneAction({ submodule_ref: 'nobody', title: 'Orphan' })))
      .rejects.toThrow(/parent submodule \("nobody"\) hasn't been committed yet/);
    expect(cc().upsertScene).not.toHaveBeenCalled();
  });

  it('fails when no parent was given at all', async () => {
    const b = backend();
    await expect(b.applyChatAction(submoduleAction({ title: 'Parentless' })))
      .rejects.toThrow(/no parent module was given/);
    await expect(b.applyChatAction(sceneAction({ title: 'Parentless' })))
      .rejects.toThrow(/no parent submodule was given/);
  });

  it('appends below the parent\'s existing children rather than overwriting slot 0', async () => {
    h.campaign.value = makeCampaignContext({
      selectedCampaign: { id: 'camp-1', name: 'Test' },
      modules: [makeModule('mod-1')],
      submodules: [
        makeSubmodule('a', { module_id: 'mod-1' }),
        makeSubmodule('b', { module_id: 'mod-1' }),
        makeSubmodule('sub-x'),
      ],
      scenes: [makeScene('s1', { submodule_id: 'sub-x' })],
      upsertSubmodule: vi.fn().mockResolvedValue({ id: 'new' }),
      upsertScene: vi.fn().mockResolvedValue({ id: 'new' }),
    });
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', title: 'Third' }));
    await b.applyChatAction(sceneAction({ submodule_id: 'sub-x', title: 'Second beat' }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 2 }));
    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 1 }));
  });

  it('keeps siblings in order across one commit, before context has refreshed', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'a', title: 'First' }));
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'b', title: 'Second' }));
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'c', title: 'Third' }));
    // Scenes under two different parents each start their own run at 0.
    await b.applyChatAction(sceneAction({ submodule_ref: 'a', title: 'a1' }));
    await b.applyChatAction(sceneAction({ submodule_ref: 'a', title: 'a2' }));
    await b.applyChatAction(sceneAction({ submodule_ref: 'b', title: 'b1' }));

    const subOrders = (cc().upsertSubmodule as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].sort_order);
    expect(subOrders).toEqual([0, 1, 2]);

    const sceneCalls = (cc().upsertScene as ReturnType<typeof vi.fn>).mock.calls.map(c => [c[0].submodule_id, c[0].sort_order]);
    expect(sceneCalls).toEqual([['sub-1', 0], ['sub-1', 1], ['sub-2', 0]]);
  });

  it('honours an explicit sort_order from the assistant', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', title: 'Pinned', sort_order: 5 }));
    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 5 }));
  });

  it('strips the ref plumbing before the write — those are not columns', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'dive', title: 'The Dive' }));

    const written = (cc().upsertSubmodule as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).not.toHaveProperty('ref');
    expect(written).not.toHaveProperty('module_ref');
  });

  it('falls back to a placeholder title rather than failing the NOT NULL column', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', summary: 'no title given' }));
    await b.applyChatAction(sceneAction({ submodule_id: 'sub-x', summary: 'no title given' }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled part' }));
    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled scene' }));
  });

  it('updates an existing submodule in place, taking the parent from the record', async () => {
    h.campaign.value = makeCampaignContext({
      selectedCampaign: { id: 'camp-1', name: 'Test' },
      submodules: [makeSubmodule('sub-9', { module_id: 'mod-7', title: 'Old name', sort_order: 3 })],
      upsertSubmodule: vi.fn().mockResolvedValue({ id: 'sub-9' }),
    });
    const b = backend();
    // No module_id / module_ref in the payload — it comes off the record.
    await b.applyChatAction(submoduleAction({ id: 'sub-9', title: 'New name' }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sub-9', module_id: 'mod-7', title: 'New name',
    }));
  });

  it('an update keeps its place in the rail instead of being shunted to the end', async () => {
    h.campaign.value = makeCampaignContext({
      selectedCampaign: { id: 'camp-1', name: 'Test' },
      submodules: [
        makeSubmodule('sub-9', { module_id: 'mod-7', title: 'Old name', sort_order: 1 }),
        makeSubmodule('sub-8', { module_id: 'mod-7', sort_order: 0 }),
      ],
      scenes: [makeScene('sc-3', { submodule_id: 'sub-9', title: 'Beat', sort_order: 2 })],
      upsertSubmodule: vi.fn().mockResolvedValue({ id: 'sub-9' }),
      upsertScene: vi.fn().mockResolvedValue({ id: 'sc-3' }),
    });
    const b = backend();
    await b.applyChatAction(submoduleAction({ id: 'sub-9', summary: 'reworded' }));
    await b.applyChatAction(sceneAction({ id: 'sc-3', summary: 'reworded' }));

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 1, title: 'Old name' }));
    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 2, title: 'Beat' }));
  });

  it('loads the whole module tree so the prompt can list existing submodules', () => {
    backend();
    expect(cc().loadModuleTree).toHaveBeenCalled();
  });

  it('merges an NPC update onto the existing record so untouched fields survive', async () => {
    h.campaign.value = makeCampaignContext({
      selectedCampaign: { id: 'camp-1', name: 'Test' },
      npcs: [makeNPC({
        id: 'npc-7', name: 'Gorval', role: 'Blacksmith',
        description: 'A gruff smith who forged the party\'s blades.',
        hooks_motivations: 'Owes a debt to the Iron Guild.',
      })],
      upsertNPC: vi.fn().mockResolvedValue({ id: 'npc-7' }),
    });
    const b = backend();
    // The assistant sends only the one field it is changing.
    await b.applyChatAction(npcAction({ id: 'npc-7', status: 'deceased' }));

    const written = (cc().upsertNPC as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toMatchObject({
      id: 'npc-7',
      status: 'deceased',
      name: 'Gorval',
      role: 'Blacksmith',
      description: 'A gruff smith who forged the party\'s blades.',
      hooks_motivations: 'Owes a debt to the Iron Guild.',
    });
  });

  describe('a thread’s clock and links', () => {
    const thread = {
      id: 't-1', title: 'The Tide', category: 'faction', description: 'It rises.', state: 'cold', is_active: true,
      last_updated_session: null, dm_only_notes: null, clock_size: 6, clock_filled: 2, clock_label: 'The wharf floods',
      npc_ids: ['npc-7'], location_ids: [], faction_ids: [], module_id: null,
    };
    const hookAction = (payload: object) => ({ type: 'upsertHook', payload }) as unknown as PendingAction;
    const written = () => (cc().upsertHook as ReturnType<typeof vi.fn>).mock.calls[0][0];
    beforeEach(() => {
      h.campaign.value = makeCampaignContext({
        selectedCampaign: { id: 'camp-1', name: 'Test' },
        hooks: [thread], npcs: [makeNPC({ id: 'npc-7', name: 'Gorval' }), makeNPC({ id: 'npc-8', name: 'Sable' })],
        modules: [makeModule('mod-1')], locations: [], factions: [],
        upsertHook: vi.fn().mockResolvedValue({ id: 't-1' }),
      });
    });

    it('advances a clock, keeping the rest of the thread', async () => {
      await backend().applyChatAction(hookAction({ id: 't-1', clock_filled: 3 }));
      expect(written()).toMatchObject({ id: 't-1', title: 'The Tide', description: 'It rises.', clock_size: 6, clock_filled: 3, clock_label: 'The wharf floods', npc_ids: ['npc-7'] });
    });

    it('starts a clock on a new thread, with links to what’s real', async () => {
      await backend().applyChatAction(hookAction({ title: 'New', clock_size: 4, clock_label: 'Boom', npc_ids: ['npc-8', 'made-up'], module_id: 'mod-1' }));
      expect(written()).toMatchObject({ title: 'New', clock_size: 4, clock_filled: 0, clock_label: 'Boom', npc_ids: ['npc-8'], module_id: 'mod-1' });
    });

    it('wakes a cold thread whose clock it fills', async () => {
      await backend().applyChatAction(hookAction({ id: 't-1', clock_filled: 6 }));
      expect(written()).toMatchObject({ clock_filled: 6, state: 'active', is_active: true });
    });

    it('refuses a chapter that doesn’t exist instead of failing the write', async () => {
      await backend().applyChatAction(hookAction({ id: 't-1', module_id: 'made-up' }));
      expect(written().module_id).toBeNull();
    });

    it('says on the card when filling a clock will wake its thread', () => {
      const rows = backend().cardRows!('upsertHook', thread, { clock_filled: 6 });
      expect(rows).toEqual(expect.arrayContaining([{ label: 'State', old: 'cold', value: 'active' }]));
    });

    it('describes a change to them by name for its card', () => {
      const rows = backend().cardRows!('upsertHook', thread, { npc_ids: ['npc-7', 'npc-8'], clock_filled: 3 });
      expect(rows).toEqual(expect.arrayContaining([
        { label: 'Clock', old: '2 of 6: The wharf floods', value: '3 of 6: The wharf floods' },
        { label: 'People', old: 'Gorval', value: 'Gorval, Sable' },
      ]));
    });
  });

  it('tells the model where an NPC’s attitude and meeting the party belong', () => {
    const prompt = backend().buildSystemPrompt();
    expect(prompt).toContain('"disposition"');
    expect(prompt).toContain('"met_by_pcs"');
    expect(prompt).toContain('never a note or the description');
  });

  it('creates an NPC verbatim when there is no id to merge onto', async () => {
    const b = backend();
    await b.applyChatAction(npcAction({ name: 'Sable Thorne', role: 'Smuggler' }));

    const written = (cc().upsertNPC as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toMatchObject({ name: 'Sable Thorne', role: 'Smuggler' });
    expect(written).not.toHaveProperty('id');
  });

  it('lists both submodule and scene actions in the system prompt', () => {
    const prompt = backend().buildSystemPrompt();
    expect(prompt).toContain('"type": "upsertSubmodule"');
    expect(prompt).toContain('"type": "upsertScene"');
    expect(prompt).toContain('"submodule_ref"');
    expect(prompt).toContain('Never invent a UUID');
    expect(prompt).toContain('There is no delete for submodules or scenes');
  });

  it('instructs the assistant to revise records in place rather than overwrite them', () => {
    const prompt = backend().buildSystemPrompt();
    expect(prompt).toContain('REVISING EXISTING RECORDS');
    expect(prompt).toContain('REVISION of the record, not a replacement');
    // The truncation guard keys off the trailing ellipsis marker.
    expect(prompt).toContain('ending in "…"');
  });
});

// --------------- Items, coin, house rules, settings and the newer fields ---------------

describe('campaign assistant — items, coin, rules and settings', () => {
  const act = (type: string, payload: Record<string, unknown>) => ({ type, payload }) as unknown as PendingAction;
  const del = (type: string, id: string) => ({ type, id, label: 'x' }) as unknown as PendingAction;
  const cloak = { id: 'i-1', name: 'Cloak', item_type: 'wondrous', rarity: 'uncommon', attunement: true, attunement_note: null, value: null, description: 'Grey.', dm_notes: null, image_path: null } as Item;
  const kaelHas = { id: 'h-1', item_id: 'i-1', pc_id: 'pc-1', quantity: 1, attuned: true, session_id: null, note: null } as ItemHolding;
  const line = { id: 'l-1', gp: 250, sp: 0, ep: 0, cp: 0, pp: 0, note: 'Vault', pc_id: null, session_id: null } as TreasuryEntry;

  beforeEach(() => {
    h.items.value = {
      items: [cloak], holdings: [kaelHas], treasury: [line], loaded: true,
      saveItem: vi.fn().mockImplementation(i => Promise.resolve({ ...i, id: i.id ?? 'i-new' })),
      deleteItem: vi.fn().mockResolvedValue(undefined),
      give: vi.fn().mockResolvedValue({}),
      updateHolding: vi.fn().mockResolvedValue(undefined),
      removeHolding: vi.fn().mockResolvedValue(undefined),
      addTreasury: vi.fn().mockResolvedValue(undefined),
      removeTreasury: vi.fn().mockResolvedValue(undefined),
    };
    h.campaign.value = makeCampaignContext({
      selectedCampaign: { id: 'camp-1', name: 'Test', house_rules: [{ id: 'r-1', topic: 'Combat', title: 'Flanking', text: 'Advantage.' }], rules_edition: null, world_date: { year: 1492, day: 10 } },
      pcs: [makePC({ id: 'pc-1', character_name: 'Kael' }), makePC({ id: 'pc-2', character_name: 'Mira' })],
      sessions: [makeSession({ id: 's-1', session_number: 4, status: 'planned', plan: { hook_ids: ['t-1'], checklist: { recap: true } } })],
      hooks: [makeHook({ id: 't-1', title: 'The Tide' }), makeHook({ id: 't-2', title: 'The Debt' })],
      locations: [makeLocation({ id: 'city', name: 'Waterdeep', parent_id: null }), makeLocation({ id: 'inn', name: 'Yawning Portal', parent_id: 'city' })],
      updateCampaign: vi.fn().mockResolvedValue(undefined),
      upsertSession: vi.fn().mockResolvedValue({ id: 's-1' }),
      upsertPC: vi.fn().mockResolvedValue({ id: 'pc-1' }),
      upsertLocation: vi.fn().mockResolvedValue({ id: 'inn' }),
    });
  });
  const items = () => h.items.value!;
  const call = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls[0];

  it('creates an item and hands it to a PC and the party', async () => {
    await backend().applyChatAction(act('upsertItem', { name: 'Potion of Healing', item_type: 'Potion', rarity: 'common', holders: [{ pc_id: 'pc-2' }, { pc_id: null, quantity: 2 }] }));
    expect(call(items().saveItem)[0]).toMatchObject({ name: 'Potion of Healing', item_type: 'potion', rarity: 'common', attunement: false });
    expect(call(items().saveItem)[0]).not.toHaveProperty('holders');
    expect(items().give).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'i-new', pc_id: 'pc-2', quantity: 1 }));
    expect(items().give).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'i-new', pc_id: null, quantity: 2 }));
  });

  it('moves an item from one PC to another, keeping the rest of it', async () => {
    await backend().applyChatAction(act('upsertItem', { id: 'i-1', holders: [{ pc_id: 'pc-2', attuned: true }] }));
    expect(call(items().saveItem)[0]).toMatchObject({ id: 'i-1', name: 'Cloak', description: 'Grey.', rarity: 'uncommon' });
    expect(items().removeHolding).toHaveBeenCalledWith(kaelHas);
    expect(items().give).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'i-1', pc_id: 'pc-2', attuned: true }));
  });

  it('leaves holders alone when the card doesn’t list them', async () => {
    await backend().applyChatAction(act('upsertItem', { id: 'i-1', value: '600 gp' }));
    expect(items().give).not.toHaveBeenCalled();
    expect(items().removeHolding).not.toHaveBeenCalled();
  });

  it('deletes an item', async () => {
    await backend().applyChatAction(del('deleteItem', 'i-1'));
    expect(items().deleteItem).toHaveBeenCalledWith('i-1');
  });

  it('adds a signed ledger line and refuses one with no coin', async () => {
    await backend().applyChatAction(act('addTreasury', { id: 'l-1', gp: -40, note: 'Bribe', pc_id: 'pc-1' }));
    expect(items().addTreasury).toHaveBeenCalledWith([expect.objectContaining({ gp: -40, note: 'Bribe', pc_id: 'pc-1' })]);
    await expect(backend().applyChatAction(act('addTreasury', { note: 'Nothing' }))).rejects.toThrow(/no coin/);
  });

  it('removes a ledger line by its id', async () => {
    await backend().applyChatAction(del('deleteTreasury', 'l-1'));
    expect(items().removeTreasury).toHaveBeenCalledWith(line);
    await expect(backend().applyChatAction(del('deleteTreasury', 'ghost'))).rejects.toThrow(/isn’t in this campaign/);
  });

  it('keeps both of two house rules committed together', async () => {
    const b = backend();
    await b.applyChatAction(act('upsertHouseRule', { topic: 'rest', title: 'Gritty rests', text: 'A week to rest.' }));
    await b.applyChatAction(act('upsertHouseRule', { id: 'r-1', text: 'Melee only.' }));
    const last = (cc().updateCampaign as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(last[0]).toBe('camp-1');
    expect(last[1].house_rules).toEqual([
      { id: 'r-1', topic: 'Combat', title: 'Flanking', text: 'Melee only.' },
      expect.objectContaining({ topic: 'Rest and healing', title: 'Gritty rests', text: 'A week to rest.' }),
    ]);
  });

  it('removes a house rule', async () => {
    await backend().applyChatAction(del('deleteHouseRule', 'r-1'));
    expect(call(cc().updateCampaign)[1]).toEqual({ house_rules: [] });
  });

  it('changes the campaign’s settings, reading the date in its calendar', async () => {
    await backend().applyChatAction(act('updateCampaign', { rules_edition: '2024', session_repeat: 'weekly', world_date: '15 Month 1 1492' }));
    expect(call(cc().updateCampaign)).toEqual(['camp-1', { rules_edition: '2024', session_repeat: 'weekly', world_date: { year: 1492, day: 15 } }]);
    await expect(backend().applyChatAction(act('updateCampaign', { levelling: 'vibes' }))).rejects.toThrow(/could be read/);
  });

  it('shows the campaign card as a change to the campaign, by name', () => {
    expect(backend().lookupExisting('upsertCampaign', null)).toMatchObject({ id: 'camp-1', name: 'Test' });
    expect(backend().cardRows!('upsertCampaign', backend().lookupExisting('upsertCampaign', null), { world_date: '12 Month 1 1492' }))
      .toEqual([{ label: 'In-world date', old: '10 Month 1 1492', value: '12 Month 1 1492' }]);
  });

  it('adds threads to a session’s prep, keeping what was planned', async () => {
    await backend().applyChatAction(act('upsertSession', { id: 's-1', plan: { hook_ids: ['t-1', 't-2', 'ghost'] }, session_time: '7pm', status: 'live' }));
    const written = call(cc().upsertSession)[0];
    expect(written).toMatchObject({ id: 's-1', session_number: 4, session_time: '19:00', plan: { hook_ids: ['t-1', 't-2'], checklist: { recap: true } } });
    // The assistant can't start a session: "live" is dropped, and an update by id leaves the status it has.
    expect(written).not.toHaveProperty('status');
  });

  it('keeps a PC’s numbers inside what the sheet allows', async () => {
    await backend().applyChatAction(act('upsertPC', { id: 'pc-1', level: '25', armor_class: 16, passive_perception: 'high', sheet_url: 'dndbeyond' }));
    const written = call(cc().upsertPC)[0];
    expect(written).toMatchObject({ id: 'pc-1', character_name: 'Kael', level: 20, armor_class: 16 });
    expect(written).not.toHaveProperty('passive_perception');
    expect(written).not.toHaveProperty('sheet_url');
  });

  it('nests a place, but never inside one of its own', async () => {
    await backend().applyChatAction(act('upsertLocation', { id: 'city', parent_id: 'inn' }));
    expect(call(cc().upsertLocation)[0]).not.toHaveProperty('parent_id', 'inn');
    expect(backend().cardRows!('upsertLocation', { id: 'inn', parent_id: 'city' }, { parent_id: null }))
      .toEqual([{ label: 'Inside', old: 'Waterdeep', value: 'Nowhere (top level)' }]);
  });

  it('tells the model about the new kinds and lists them with their ids', () => {
    const prompt = backend().buildSystemPrompt();
    for (const type of ['upsertItem', 'addTreasury', 'upsertHouseRule', 'updateCampaign']) expect(prompt).toContain(`"type": "${type}"`);
    expect(prompt).toContain('deleteItem, deleteTreasury, deleteHouseRule');
    expect(prompt).toContain('Never set "live"');
    expect(prompt).toContain('Cloak — Uncommon wondrous item, requires attunement; held by Kael (attuned) [id:i-1]');
    expect(prompt).toContain('+250 gp — Vault [id:l-1]');
    expect(prompt).toContain('Flanking: Advantage. [id:r-1]');
    expect(prompt).toContain('In-world date: 10 Month 1 1492');
  });
});
