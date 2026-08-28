// Covers the campaign assistant's submodule/scene write path: resolving a
// parent that is either already in the campaign or is being created in the
// same batch, appending sort_order, and failing legibly when a parent hasn't
// been committed yet.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeCampaignContext } from '../test/contextMocks';
import { makeSubmodule, makeScene } from '../test/fixtures';
import type { PendingAction } from './useAIChat';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
}));
vi.mock('../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../context/WorldContext', () => ({ useWorld: () => ({}) }));

import { useCampaignAssistantBackend } from './assistantBackend';

const cc = () => h.campaign.value!;

let subSeq = 0;
beforeEach(() => {
  subSeq = 0;
  h.campaign.value = makeCampaignContext({
    selectedCampaign: { id: 'camp-1', name: 'Test' },
    upsertSubmodule: vi.fn().mockImplementation(() => Promise.resolve({ id: `sub-${++subSeq}` })),
    upsertScene: vi.fn().mockResolvedValue({ id: 'scene-1' }),
  });
});

const backend = () => renderHook(() => useCampaignAssistantBackend()).result.current;

const submoduleAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertSubmodule', payload } as unknown as PendingAction);
const sceneAction = (payload: Record<string, unknown>) =>
  ({ type: 'upsertScene', payload } as unknown as PendingAction);

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

  it('prefers a real parent id over a ref when both are present', async () => {
    const b = backend();
    await b.applyChatAction(submoduleAction({ module_id: 'mod-1', ref: 'dive', title: 'The Dive' }));
    await b.applyChatAction(sceneAction({ submodule_id: 'existing-sub', submodule_ref: 'dive', title: 'X' }));

    expect(cc().upsertScene).toHaveBeenCalledWith(expect.objectContaining({ submodule_id: 'existing-sub' }));
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
      submodules: [makeSubmodule('a', { module_id: 'mod-1' }), makeSubmodule('b', { module_id: 'mod-1' })],
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

    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled Submodule' }));
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

  it('lists both submodule and scene actions in the system prompt', () => {
    const prompt = backend().buildSystemPrompt();
    expect(prompt).toContain('"type": "upsertSubmodule"');
    expect(prompt).toContain('"type": "upsertScene"');
    expect(prompt).toContain('"submodule_ref"');
    expect(prompt).toContain('Never invent a UUID');
    expect(prompt).toContain('There is no delete for submodules or scenes');
  });
});
