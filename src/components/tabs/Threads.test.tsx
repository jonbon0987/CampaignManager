import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Hook } from '../../lib/database.types';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeHook, makeModule, makeSubmodule } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
  toast: vi.fn(),
  getSubmodulesByModule: vi.fn(),
  getScenesBySubmodule: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
// PromoteThreadModal reads submodules/scenes straight from the db layer (which
// pulls in supabase); stub just the read methods it uses.
vi.mock('../../lib/db', () => ({
  Submodules: { getByModule: h.getSubmodulesByModule },
  Scenes: { getBySubmodule: h.getScenesBySubmodule },
}));
// The description editor pulls in EntityRefContext; stub it to a plain textarea.
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="summary" value={value ?? ''} onChange={e => onChange(e.target.value)} />
  ),
}));

import Threads from './Threads';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.confirm.value = makeConfirm(true);
  h.toast.mockReset();
  h.getSubmodulesByModule.mockReset().mockResolvedValue([]);
  h.getScenesBySubmodule.mockReset().mockResolvedValue([]);
});

describe('Threads', () => {
  it('summarizes live vs total counts (resolved is not live)', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [
        makeHook({ id: 'a', title: 'A', state: 'seed' }),
        makeHook({ id: 'b', title: 'B', state: 'active' }),
        makeHook({ id: 'c', title: 'C', state: 'resolved', is_active: false }),
      ],
    });
    render(<Threads />);
    expect(screen.getByText(/2 live · 3 total/)).toBeTruthy();
  });

  it('shows the empty state when there are no threads', () => {
    render(<Threads />);
    expect(screen.getByText('No threads yet. Promote an idea or add one.')).toBeTruthy();
  });

  it('filters the board by search text', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [makeHook({ id: 'a', title: 'The Seventh Shard' }), makeHook({ id: 'b', title: 'Missing Caravan' })],
    });
    render(<Threads />);
    expect(screen.getByText('Missing Caravan')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search threads…'), { target: { value: 'shard' } });
    expect(screen.getByText('The Seventh Shard')).toBeTruthy();
    expect(screen.queryByText('Missing Caravan')).toBeNull();
  });

  it('creates a new thread from the modal', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'x', title: 'Existing' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: /New Thread/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g., The Seventh Shard'), { target: { value: 'The Heist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(cc().upsertHook).toHaveBeenCalledWith(
      expect.objectContaining({ id: undefined, title: 'The Heist', category: 'side_quest', state: 'seed', is_active: true }),
    );
  });

  it('edits an existing thread (preserves its id)', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'Old title', state: 'active' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., The Seventh Shard'), { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', title: 'New title' }));
  });

  it('changes a thread lifecycle state inline', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T', state: 'seed' })] });
    render(<Threads />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } });
    expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', state: 'resolved', is_active: false }));
  });

  it('deletes a thread after confirmation', async () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T' })] });
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    await waitFor(() => expect(cc().deleteHook).toHaveBeenCalledWith('h1'));
  });

  describe('promote to module structure', () => {
    it('opens the promote dialog from a thread card', () => {
      h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'The Heist' })] });
      render(<Threads />);
      fireEvent.click(screen.getByRole('button', { name: '↗' }));
      expect(screen.getByText('Promote thread')).toBeTruthy();
    });

    it('promotes a thread to a new module (the default target)', async () => {
      const upsertModule = vi.fn().mockResolvedValue({ id: 'm-new' });
      h.campaign.value = makeCampaignContext({
        hooks: [makeHook({ id: 'h1', title: 'The Heist', description: 'One last job.' })],
        upsertModule,
      });
      render(<Threads />);
      fireEvent.click(screen.getByRole('button', { name: '↗' }));
      fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
      await waitFor(() => expect(upsertModule).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'The Heist', synopsis: 'One last job.', status: 'planned' }),
      ));
      expect(h.toast).toHaveBeenCalled();
    });

    it('requires a target module before promoting to a submodule', async () => {
      const upsertSubmodule = vi.fn().mockResolvedValue(undefined);
      h.campaign.value = makeCampaignContext({
        hooks: [makeHook({ id: 'h1', title: 'The Heist' })],
        modules: [makeModule('m1', 'planned', { title: 'Chapter One', chapter: '1' })],
        upsertSubmodule,
      });
      render(<Threads />);
      fireEvent.click(screen.getByRole('button', { name: '↗' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submodule' }));
      // Disabled until a module is chosen.
      expect((screen.getByRole('button', { name: 'Promote' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: /Chapter One/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
      await waitFor(() => expect(upsertSubmodule).toHaveBeenCalledWith(
        expect.objectContaining({ module_id: 'm1', title: 'The Heist', sort_order: 0 }),
      ));
    });

    it('promotes to a scene under a submodule picked from the tree', async () => {
      const upsertScene = vi.fn().mockResolvedValue(undefined);
      h.getSubmodulesByModule.mockResolvedValue([makeSubmodule('s1', { module_id: 'm1', title: 'The Vault' })]);
      h.campaign.value = makeCampaignContext({
        hooks: [makeHook({ id: 'h1', title: 'The Heist' })],
        modules: [makeModule('m1', 'planned', { title: 'Chapter One', chapter: '1' })],
        upsertScene,
      });
      render(<Threads />);
      fireEvent.click(screen.getByRole('button', { name: '↗' }));
      fireEvent.click(screen.getByRole('button', { name: 'Scene' }));
      // The tree loads submodules for every module; pick one.
      const vault = await screen.findByRole('button', { name: 'The Vault' });
      fireEvent.click(vault);
      fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
      await waitFor(() => expect(upsertScene).toHaveBeenCalledWith(
        expect.objectContaining({ submodule_id: 's1', title: 'The Heist', sort_order: 0 }),
      ));
    });
  });
});
