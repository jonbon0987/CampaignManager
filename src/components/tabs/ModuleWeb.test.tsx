import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { makeModule, makeModuleDep, makeSubmodule, makeScene, makeSubmoduleDep } from '../../test/fixtures';
import ModuleWeb from './ModuleWeb';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  getSubmodulesByModules: vi.fn(),
  getScenesBySubmodules: vi.fn(),
  getSubDepsBySubmodules: vi.fn(),
  upsertSubmodule: vi.fn(),
  upsertScene: vi.fn(),
  upsertSubDep: vi.fn(),
  deleteSubDep: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
// The web loads the whole campaign's children at once, straight off the db layer.
vi.mock('../../lib/db', () => ({
  Submodules: { getByModules: h.getSubmodulesByModules, upsert: h.upsertSubmodule },
  Scenes: { getBySubmodules: h.getScenesBySubmodules, upsert: h.upsertScene },
  SubmoduleDeps: { getBySubmodules: h.getSubDepsBySubmodules, upsert: h.upsertSubDep, delete: h.deleteSubDep },
}));

const cc = () => h.campaign.value!;

/** The stage's bodies — titles also appear in the rail, so queries scope to one or the other. */
const stage = () => document.querySelector('.orr-nodes') as unknown as HTMLElement;
/** The rail — everything selection-dependent lives inside it. */
const rail = () => document.querySelector('.orr-side') as HTMLElement;

const findBody = (title: string) => within(stage()).findByText(title);

/** Click a body: pointer down on its <g>, up on the window (no drag between). */
function selectBody(title: string) {
  const g = within(stage()).getByText(title).closest('g')!;
  fireEvent.pointerDown(g, { button: 0 });
  fireEvent.pointerUp(window);
}

/** The ring badge on a chapter/part body, which toggles its children open. */
function ringBadge(title: string) {
  return within(stage()).getByText(title).closest('g.orr-node')!.querySelector('g.orr-badge')!;
}

beforeEach(() => {
  h.getSubmodulesByModules.mockReset().mockResolvedValue([]);
  h.getScenesBySubmodules.mockReset().mockResolvedValue([]);
  h.getSubDepsBySubmodules.mockReset().mockResolvedValue([]);
  h.upsertSubmodule.mockReset().mockImplementation(async (s) => ({ ...s, id: 'new-sub' }));
  h.upsertScene.mockReset().mockImplementation(async (s) => ({ ...s, id: 'new-scene' }));
  h.upsertSubDep.mockReset().mockImplementation(async (d) => ({ ...d, id: 'new-dep' }));
  h.deleteSubDep.mockReset().mockResolvedValue(undefined);
  h.campaign.value = makeCampaignContext({
    selectedCampaignId: 'c1',
    modules: [
      makeModule('m1', 'active', { title: 'Alpha', chapter: '1', synopsis: 'The opening move.' }),
      makeModule('m2', 'planned', { title: 'Beta', chapter: '2' }),
      makeModule('m3', 'completed', { title: 'Gamma', chapter: '3' }),
    ],
    // Beta requires Alpha.
    moduleDeps: [makeModuleDep('m2', 'm1')],
    upsertModuleDep: vi.fn().mockResolvedValue(undefined),
    deleteModuleDep: vi.fn().mockResolvedValue(undefined),
  });
});

describe('ModuleWeb', () => {
  it('renders a body per module and counts them in the stage bar', async () => {
    render(<ModuleWeb />);
    expect(within(stage()).getByText('Alpha')).toBeTruthy();
    expect(within(stage()).getByText('Beta')).toBeTruthy();
    expect(within(stage()).getByText('Gamma')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('3 chapters · 0 parts · 0 scenes')).toBeTruthy());
  });

  it('starts with nothing selected', () => {
    render(<ModuleWeb />);
    expect(screen.getByText('Nothing selected')).toBeTruthy();
  });

  it('selecting a chapter fills the rail with its crumb, prose and dependencies', () => {
    render(<ModuleWeb />);
    selectBody('Beta');
    const r = within(rail());
    expect(r.getByText('Chapter 2')).toBeTruthy();
    expect(r.getByRole('heading', { name: 'Beta' })).toBeTruthy();
    // Beta requires Alpha; Alpha is listed under Requires, nothing under Unlocks.
    expect(r.getByText('Requires')).toBeTruthy();
    expect(r.getByRole('button', { name: 'Alpha' })).toBeTruthy();
    expect(r.getByText('Nothing yet.')).toBeTruthy();
  });

  it('removes a dependency from the rail', async () => {
    render(<ModuleWeb />);
    selectBody('Beta');
    fireEvent.click(within(rail()).getByTitle('Remove'));
    await waitFor(() => expect(cc().deleteModuleDep).toHaveBeenCalledWith('m2->m1'));
  });

  it('seeds selection and expansion from initialModuleId', async () => {
    h.getSubmodulesByModules.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' })]);
    render(<ModuleWeb initialModuleId="m1" />);
    // Chapter 1 arrives selected...
    expect(within(rail()).getByRole('heading', { name: 'Alpha' })).toBeTruthy();
    // ...and already expanded, so its part is a body on the stage.
    expect(await findBody('The Break-in')).toBeTruthy();
  });

  it('opens a chapter\'s parts from its ring badge', async () => {
    h.getSubmodulesByModules.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' })]);
    render(<ModuleWeb />);
    await waitFor(() => expect(h.getSubmodulesByModules).toHaveBeenCalledWith(['m1', 'm2', 'm3']));
    expect(within(stage()).queryByText('The Break-in')).toBeNull();
    fireEvent.pointerDown(ringBadge('Alpha'));
    expect(await findBody('The Break-in')).toBeTruthy();
  });

  it('Reveal → Parts expands every chapter at once', async () => {
    h.getSubmodulesByModules.mockResolvedValue([
      makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' }),
      makeSubmodule('s2', { module_id: 'm2', title: 'The Escape' }),
    ]);
    render(<ModuleWeb />);
    await waitFor(() => expect(h.getSubmodulesByModules).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(await findBody('The Break-in')).toBeTruthy();
    expect(within(stage()).getByText('The Escape')).toBeTruthy();
  });

  it('status chips filter chapters out of the web', async () => {
    render(<ModuleWeb />);
    fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
    await waitFor(() => expect(within(stage()).queryByText('Beta')).toBeNull());
    expect(within(stage()).getByText('Alpha')).toBeTruthy();
  });

  it('adds a part from the rail, appended after existing siblings', async () => {
    h.getSubmodulesByModules.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' })]);
    render(<ModuleWeb />);
    await waitFor(() => expect(h.getSubmodulesByModules).toHaveBeenCalled());
    selectBody('Alpha');
    fireEvent.click(within(rail()).getByRole('button', { name: /New part/ }));
    fireEvent.change(within(rail()).getByPlaceholderText('Name it…'), { target: { value: 'The Vault' } });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(h.upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({
      module_id: 'm1', title: 'The Vault', submodule_type: 'location', sort_order: 1,
    })));
  });

  it('a part\'s primary button opens its owning module', async () => {
    const onOpen = vi.fn();
    h.getSubmodulesByModules.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' })]);
    render(<ModuleWeb onOpen={onOpen} initialModuleId="m1" />);
    const part = await findBody('The Break-in');
    fireEvent.pointerDown(part.closest('g')!, { button: 0 });
    fireEvent.pointerUp(window);
    // The editor takes module ids only, and the label says so.
    fireEvent.click(within(rail()).getByRole('button', { name: 'Open module →' }));
    expect(onOpen).toHaveBeenCalledWith('m1');
  });

  it('a scene shows no Requires/Unlocks — scenes run in order', async () => {
    h.getSubmodulesByModules.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in' })]);
    h.getScenesBySubmodules.mockResolvedValue([makeScene('sc1', { submodule_id: 's1', title: 'Pick the lock', scene_type: 'puzzle' })]);
    render(<ModuleWeb initialModuleId="m1" />);
    await findBody('The Break-in');
    fireEvent.pointerDown(ringBadge('The Break-in'));
    const scene = await findBody('Pick the lock');
    fireEvent.pointerDown(scene.closest('g')!, { button: 0 });
    fireEvent.pointerUp(window);
    const r = within(rail());
    expect(r.getByRole('heading', { name: 'Pick the lock' })).toBeTruthy();
    expect(r.queryByText('Requires')).toBeNull();
    expect(r.queryByText('Unlocks')).toBeNull();
  });

  it('lists submodule-level dependencies for a selected part', async () => {
    h.getSubmodulesByModules.mockResolvedValue([
      makeSubmodule('s1', { module_id: 'm1', title: 'The Break-in', sort_order: 0 }),
      makeSubmodule('s2', { module_id: 'm1', title: 'The Escape', sort_order: 1 }),
    ]);
    h.getSubDepsBySubmodules.mockResolvedValue([makeSubmoduleDep('s2', 's1', { dependency_type: 'required' })]);
    render(<ModuleWeb initialModuleId="m1" />);
    const part = await findBody('The Escape');
    fireEvent.pointerDown(part.closest('g')!, { button: 0 });
    fireEvent.pointerUp(window);
    const r = within(rail());
    expect(r.getByText('Requires')).toBeTruthy();
    expect(r.getByRole('button', { name: 'The Break-in' })).toBeTruthy();
    fireEvent.click(r.getByTitle('Remove'));
    await waitFor(() => expect(h.deleteSubDep).toHaveBeenCalledWith('s2->s1'));
  });
});
