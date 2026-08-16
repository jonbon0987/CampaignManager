import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeModule, makeModuleDep, makeSubmodule } from '../../test/fixtures';
import ModuleWeb from './ModuleWeb';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
  getSubmodulesByModule: vi.fn(),
  getScenesBySubmodule: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
// ModuleWeb reads submodules/scenes straight from the db layer when drilling.
vi.mock('../../lib/db', () => ({
  Submodules: { getByModule: h.getSubmodulesByModule },
  Scenes: { getBySubmodule: h.getScenesBySubmodule },
}));

const cc = () => h.campaign.value!;

/** Focus a module node by clicking its <g> (pointer down+up, no drag). */
function focusNode(title: string) {
  const g = screen.getByText(title).closest('g')!;
  fireEvent.pointerDown(g);
  fireEvent.pointerUp(g);
}

beforeEach(() => {
  h.confirm.value = makeConfirm(true);
  h.getSubmodulesByModule.mockReset().mockResolvedValue([]);
  h.getScenesBySubmodule.mockReset().mockResolvedValue([]);
  h.campaign.value = makeCampaignContext({
    selectedCampaignId: 'c1',
    modules: [
      makeModule('m1', 'active', { title: 'Alpha', chapter: '1' }),
      makeModule('m2', 'planned', { title: 'Beta', chapter: '2' }),
      makeModule('m3', 'planned', { title: 'Gamma', chapter: '3' }),
    ],
    // Alpha depends on Beta (Beta is the prerequisite).
    moduleDeps: [makeModuleDep('m1', 'm2')],
    upsertModuleDep: vi.fn().mockResolvedValue(undefined),
    deleteModuleDep: vi.fn().mockResolvedValue(undefined),
  });
});

describe('ModuleWeb', () => {
  it('renders a node per module', () => {
    render(<ModuleWeb />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('shows a focused module\'s existing dependency (Requires)', () => {
    render(<ModuleWeb />);
    focusNode('Alpha');
    expect(screen.getByText('Requires')).toBeTruthy();
    // The prerequisite (Beta) is listed under Requires.
    expect(screen.getByText(/Ch\. 2 · Beta/)).toBeTruthy();
  });

  it('adds a dependency from the focus panel', async () => {
    render(<ModuleWeb />);
    focusNode('Beta'); // Beta has no prereqs yet
    fireEvent.click(screen.getByRole('button', { name: '+ Add Dependency' }));
    // Gamma (m3) is unrelated, so Beta → requires Gamma is not a cycle.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(cc().upsertModuleDep).toHaveBeenCalledWith(
      expect.objectContaining({ dependent_id: 'm2', prerequisite_id: 'm3', dependency_type: 'required' }),
    ));
  });

  it('removes a dependency from the focus panel', async () => {
    render(<ModuleWeb />);
    focusNode('Alpha');
    fireEvent.click(screen.getByTitle('Remove'));
    await waitFor(() => expect(cc().deleteModuleDep).toHaveBeenCalledWith('m1->m2'));
  });

  it('drills from a focused module into its submodules, chained in sort order', async () => {
    h.getSubmodulesByModule.mockResolvedValue([
      makeSubmodule('sub2', { module_id: 'm1', title: 'The Escape', sort_order: 1 }),
      makeSubmodule('sub1', { module_id: 'm1', title: 'The Break-in', sort_order: 0 }),
    ]);
    render(<ModuleWeb />);
    focusNode('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'View submodules →' }));
    await waitFor(() => expect(h.getSubmodulesByModule).toHaveBeenCalledWith('m1'));
    // Both submodules render as nodes...
    expect(await screen.findByText('The Break-in')).toBeTruthy();
    expect(screen.getByText('The Escape')).toBeTruthy();
    // ...and the breadcrumb reflects the drilled module.
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy();
    // Module-status filters don't apply at the submodule level.
    expect(screen.queryByText('completed')).toBeNull();
  });

  it('starts drilled into a module\'s submodules when given initialModuleId', async () => {
    h.getSubmodulesByModule.mockResolvedValue([makeSubmodule('sub1', { module_id: 'm1', title: 'The Break-in', sort_order: 0 })]);
    render(<ModuleWeb initialModuleId="m1" />);
    await waitFor(() => expect(h.getSubmodulesByModule).toHaveBeenCalledWith('m1'));
    expect(await screen.findByText('The Break-in')).toBeTruthy();
    // Breadcrumb reflects the drilled module; not the top-level module list.
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('drills from a submodule into its scenes, then breadcrumbs back to modules', async () => {
    h.getSubmodulesByModule.mockResolvedValue([makeSubmodule('sub1', { module_id: 'm1', title: 'The Break-in', sort_order: 0 })]);
    h.getScenesBySubmodule.mockResolvedValue([
      { id: 'sc1', submodule_id: 'sub1', title: 'Pick the lock', scene_type: 'skill', summary: null, sort_order: 0 },
    ]);
    render(<ModuleWeb />);
    focusNode('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'View submodules →' }));
    const sub = await screen.findByText('The Break-in');
    fireEvent.pointerDown(sub.closest('g')!);
    fireEvent.pointerUp(sub.closest('g')!);
    fireEvent.click(screen.getByRole('button', { name: 'View scenes →' }));
    await waitFor(() => expect(h.getScenesBySubmodule).toHaveBeenCalledWith('sub1'));
    expect(await screen.findByText('Pick the lock')).toBeTruthy();
    // Breadcrumb back to the top level.
    fireEvent.click(screen.getByRole('button', { name: 'Module Web' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('blocks a dependency that would create a cycle', async () => {
    render(<ModuleWeb />);
    // Alpha already requires Beta; making Beta require Alpha would be circular.
    focusNode('Beta');
    fireEvent.click(screen.getByRole('button', { name: '+ Add Dependency' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/circular dependency/i)).toBeTruthy();
    expect(cc().upsertModuleDep).not.toHaveBeenCalled();
  });
});
