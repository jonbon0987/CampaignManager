import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Idea } from '../../lib/database.types';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeHook, makeModule, makeSubmodule } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
  toast: vi.fn(),
  openRecord: vi.fn(),
  getSubmodulesByModule: vi.fn(),
  getScenesBySubmodule: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.openRecord, useReportRecord: () => {} }));
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
vi.mock('../session/SessionHistory', () => ({ SessionHistory: () => null }));
vi.mock('../session/SessionUpdateBand', () => ({ SessionUpdateBand: () => null }));

import Threads from './Threads';

const cc = () => h.campaign.value!;

let n = 0;
const makeIdea = (over: Partial<Idea> = {}): Idea => ({
  id: `i${++n}`, text: 'a spark', tag: null, promoted_hook_id: null,
  created_at: new Date().toISOString(), updated_at: '', campaign_id: 'c', user_id: 'u',
  ...over,
} as Idea);

const column = (name: string) => screen.getByRole('region', { name });
/** A drag carrying a thread or an idea, as the board's cards set it. */
const carrying = (kind: 'thread' | 'idea', id: string) => {
  const type = `application/x-${kind}`;
  return { dataTransfer: { types: [type], getData: (t: string) => (t === type ? id : '') } };
};
/** Open a thread's page from its card. */
const openCard = (title: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
/** Open the thread's page and pick "Promote to a module…" from its menu. */
const promoteFromPage = async (title: string) => {
  openCard(title);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByText('Promote to a module…'));
  await screen.findByText('Promote thread');
};


beforeEach(() => {
  h.campaign.value = makeCampaignContext();
  h.confirm.value = makeConfirm(true);
  h.toast.mockReset();
  h.openRecord.mockReset();
  n = 0;
  h.getSubmodulesByModule.mockReset().mockResolvedValue([]);
  h.getScenesBySubmodule.mockReset().mockResolvedValue([]);
});

describe('Threads board', () => {
  it('lays out Inbox, Seed, Active, Cold and Resolved, each thread in its state’s column', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [
        makeHook({ id: 'a', title: 'Seedling', state: 'seed' }),
        makeHook({ id: 'b', title: 'Burning', state: 'active' }),
        makeHook({ id: 'c', title: 'Done deal', state: 'resolved', is_active: false }),
      ],
    });
    render(<Threads />);
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Inbox', 'Seed', 'Active', 'Cold', 'Resolved']);
    expect(within(column('Seed')).getByText('Seedling')).toBeTruthy();
    expect(within(column('Active')).getByText('Burning')).toBeTruthy();
    expect(within(column('Resolved')).getByText('Done deal')).toBeTruthy();
    expect(screen.getByText(/2 live · 3 total/)).toBeTruthy();
  });

  it('shows a thread’s state once: its column, with no badge or picker on the card', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'a', title: 'Seedling', state: 'seed' })] });
    render(<Threads />);
    expect(within(column('Seed')).queryByRole('combobox')).toBeNull();
    expect(column('Seed').querySelector('.cm-state-badge')).toBeNull();
  });

  it('filters threads and ideas by search text', () => {
    h.campaign.value = makeCampaignContext({
      hooks: [makeHook({ id: 'a', title: 'The Seventh Shard' }), makeHook({ id: 'b', title: 'Missing Caravan' })],
      ideas: [makeIdea({ text: 'a shard of glass' }), makeIdea({ text: 'a talking cat' })],
    });
    render(<Threads />);
    fireEvent.change(screen.getByPlaceholderText('Search threads and ideas…'), { target: { value: 'shard' } });
    expect(screen.getByText('The Seventh Shard')).toBeTruthy();
    expect(screen.queryByText('Missing Caravan')).toBeNull();
    expect(screen.getByText('a shard of glass')).toBeTruthy();
    expect(screen.queryByText('a talking cat')).toBeNull();
  });

  it('adds a thread as a seed draft', async () => {
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add thread' }));
    await waitFor(() => expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ title: '', state: 'seed', is_active: true })));
  });

  it('moves a thread dragged to another column', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T', state: 'active', last_updated_session: 4 })] });
    render(<Threads />);
    fireEvent.dragOver(column('Cold'), carrying('thread', 'h1'));
    fireEvent.drop(column('Cold'), carrying('thread', 'h1'));
    expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', state: 'cold', is_active: true, last_updated_session: 4 }));
  });

  it('promotes an idea dropped on a thread column, in that state', async () => {
    const idea = makeIdea({ id: 'i1', text: 'The bridge troll owes a debt' });
    const promoteIdea = vi.fn().mockResolvedValue(makeHook({ id: 'h9', title: 'The bridge troll', state: 'seed' }));
    h.campaign.value = makeCampaignContext({ ideas: [idea], promoteIdea });
    render(<Threads />);
    fireEvent.drop(column('Active'), carrying('idea', 'i1'));
    await waitFor(() => expect(promoteIdea).toHaveBeenCalledWith(idea, 'side_quest'));
    await waitFor(() => expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h9', state: 'active' })));
  });

  it('ignores a drop on the Inbox', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T', state: 'active' })] });
    render(<Threads />);
    fireEvent.drop(column('Inbox'), carrying('thread', 'h1'));
    expect(cc().upsertHook).not.toHaveBeenCalled();
  });
});

describe('A thread’s page', () => {
  it('opens from its card and saves as you type, keeping its id', async () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'Old title', state: 'active', last_updated_session: 3 })] });
    render(<Threads />);
    openCard('Old title');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });
    await waitFor(() => expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', title: 'New title', last_updated_session: 3 })), { timeout: 2000 });
  });

  it('resolving a thread marks it inactive', async () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T', state: 'seed' })] });
    render(<Threads />);
    openCard('T');
    fireEvent.click(screen.getByRole('radio', { name: 'Resolved' }));
    await waitFor(() => expect(cc().upsertHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', state: 'resolved', is_active: false })), { timeout: 2000 });
  });

  it('deletes a thread after confirmation', async () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'T' })] });
    render(<Threads />);
    openCard('T');
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Delete thread'));
    await waitFor(() => expect(cc().deleteHook).toHaveBeenCalledWith('h1'));
  });

  it('opens the thread asked for from elsewhere', () => {
    h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'Asked for' })] });
    const onOpenConsumed = vi.fn();
    render(<Threads openId="h1" onOpenConsumed={onOpenConsumed} />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Asked for');
    expect(onOpenConsumed).toHaveBeenCalled();
  });
});

describe('The Inbox', () => {
  it('holds ideas not yet promoted', () => {
    h.campaign.value = makeCampaignContext({
      ideas: [makeIdea({ text: 'inbox one' }), makeIdea({ text: 'already promoted', promoted_hook_id: 'hook-9' })],
    });
    render(<Threads />);
    expect(within(column('Inbox')).getByText('inbox one')).toBeTruthy();
    expect(screen.queryByText('already promoted')).toBeNull();
    expect(screen.getByText(/1 in the inbox/)).toBeTruthy();
  });

  it('saves a trimmed idea with its tag', () => {
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add idea' }));
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: '  new spark  ' } });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'twist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save idea' }));
    expect(cc().upsertIdea).toHaveBeenCalledWith({ text: 'new spark', tag: 'twist', promoted_hook_id: null });
  });

  it('won’t save a blank idea', () => {
    render(<Threads />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add idea' }));
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Save idea' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('dismisses an idea only after the DM confirms', async () => {
    h.confirm.value = makeConfirm(false);
    h.campaign.value = makeCampaignContext({ ideas: [makeIdea({ id: 'i1' })] });
    const { unmount } = render(<Threads />);
    fireEvent.click(screen.getByText('Dismiss'));
    await waitFor(() => expect(h.confirm.value).toHaveBeenCalled());
    expect(cc().deleteIdea).not.toHaveBeenCalled();
    unmount();

    h.confirm.value = makeConfirm(true);
    render(<Threads />);
    fireEvent.click(screen.getByText('Dismiss'));
    await waitFor(() => expect(cc().deleteIdea).toHaveBeenCalledWith('i1'));
  });

  it('promotes an idea to a thread', async () => {
    const idea = makeIdea({ id: 'i1' });
    h.campaign.value = makeCampaignContext({ ideas: [idea] });
    render(<Threads />);
    fireEvent.click(screen.getByText('Promote ▾'));
    fireEvent.click(screen.getByRole('button', { name: /to a Thread/ }));
    await waitFor(() => expect(cc().promoteIdea).toHaveBeenCalledWith(idea, 'side_quest'));
  });

  it('promotes an idea to a lore entry and opens it', async () => {
    const upsertLore = vi.fn().mockResolvedValue({ id: 'lore-new' });
    h.campaign.value = makeCampaignContext({ ideas: [makeIdea({ id: 'i1', text: 'The moon was once two moons' })], upsertLore });
    render(<Threads />);
    fireEvent.click(screen.getByText('Promote ▾'));
    fireEvent.click(screen.getByRole('button', { name: /to a Lore entry/ }));
    await waitFor(() => expect(h.openRecord).toHaveBeenCalledWith('lore', 'lore-new'));
    expect(upsertLore).toHaveBeenCalledWith(expect.objectContaining({ title: 'The moon was once two moons', content: 'The moon was once two moons' }));
    expect(cc().deleteIdea).toHaveBeenCalledWith('i1');
  });
});

describe('Threads', () => {
  describe('promote to module structure', () => {
    it('opens the promote dialog from a thread’s page', async () => {
      h.campaign.value = makeCampaignContext({ hooks: [makeHook({ id: 'h1', title: 'The Heist' })] });
      render(<Threads />);
      await promoteFromPage('The Heist');
      expect(screen.getByText('Promote thread')).toBeTruthy();
    });

    it('promotes a thread to a new module (the default target)', async () => {
      const upsertModule = vi.fn().mockResolvedValue({ id: 'm-new' });
      h.campaign.value = makeCampaignContext({
        hooks: [makeHook({ id: 'h1', title: 'The Heist', description: 'One last job.' })],
        upsertModule,
      });
      render(<Threads />);
      await promoteFromPage('The Heist');
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
      await promoteFromPage('The Heist');
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
      await promoteFromPage('The Heist');
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
