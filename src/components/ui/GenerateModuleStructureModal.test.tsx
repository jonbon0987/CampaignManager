import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext, makeToast } from '../../test/contextMocks';
import { makeModule, makeSubmodule } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  toast: { value: null as ReturnType<typeof makeToast> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast.value }));
vi.mock('../../context/EntityRefContext', () => ({
  useEntityRefs: () => ({ entities: [], refById: () => null, detailFor: () => ({ label: '', sub: '', desc: '', meta: [] }) }),
}));
vi.mock('../../lib/apiClient', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));

import { GenerateModuleStructureModal } from './GenerateModuleStructureModal';

const cc = () => h.campaign.value!;

const MODULE = makeModule('mod-1', 'active', {
  title: 'The Sunken Crown',
  chapter: '3',
  synopsis: 'The party dives for a drowned regalia.',
  rewards: null,
  dm_notes: null,
});

const TREE = {
  submodules: [
    {
      title: 'The Harbor Bribe', type: 'social', summary: 'Buy passage.',
      content: 'Long write-up.', dm_notes: 'Vell folds at 50gp.',
      scenes: [
        { title: 'The Toll Office', type: 'social', summary: 'Vell names his price.' },
        { title: 'Cutting Him Out', type: 'exploration' },
      ],
    },
    { title: 'The Dive', type: 'exploration', summary: 'Down into the wreck.', scenes: [] },
  ],
};

function mockFetch(body: unknown, ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
  vi.stubGlobal('fetch', f);
  return f;
}

/** Run the generate step and wait for the review list. */
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  await screen.findByText('The Harbor Bribe');
}

const renderModal = (over: Partial<React.ComponentProps<typeof GenerateModuleStructureModal>> = {}) =>
  render(
    <GenerateModuleStructureModal
      isOpen
      module={MODULE}
      existing={[]}
      onClose={vi.fn()}
      {...over}
    />,
  );

beforeEach(() => {
  h.campaign.value = makeCampaignContext({
    upsertSubmodule: vi.fn().mockImplementation((s: { title: string }) =>
      Promise.resolve({ id: `new-${s.title.replace(/\s+/g, '-')}` })),
    upsertScene: vi.fn().mockResolvedValue({ id: 'sc' }),
  });
  h.toast.value = makeToast();
});
afterEach(() => vi.unstubAllGlobals());

describe('GenerateModuleStructureModal', () => {
  it('sends the module synopsis and the chosen counts in the prompt', async () => {
    const f = mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    await generate();

    const prompt = JSON.parse(f.mock.calls[0][1].body).prompt as string;
    expect(prompt).toContain('The Sunken Crown');
    expect(prompt).toContain('drowned regalia');
    expect(prompt).toContain('author 4 submodules');   // default count
    expect(prompt).toContain('exactly 3 scenes');      // default scenes-per
  });

  it('names the module\'s existing submodules so the AI continues rather than repeats', async () => {
    const f = mockFetch({ text: JSON.stringify(TREE) });
    renderModal({ existing: [makeSubmodule('s1', { title: 'The Toll Road' })] });
    await generate();

    const prompt = JSON.parse(f.mock.calls[0][1].body).prompt as string;
    expect(prompt).toContain('ALREADY has these submodules');
    expect(prompt).toContain('- The Toll Road');
  });

  it('shows the drafted tree for review and writes nothing until the DM saves', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    await generate();

    expect(screen.getByText('The Dive')).toBeTruthy();
    expect(screen.getByText('The Toll Office')).toBeTruthy();
    expect(screen.getByText('2 of 2 submodules · 2 scenes')).toBeTruthy();
    expect(cc().upsertSubmodule).not.toHaveBeenCalled();
  });

  it('writes the kept submodules and hangs each scene off its own new parent', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    const onClose = vi.fn();
    const onCreated = vi.fn();
    renderModal({ onClose, onCreated });
    await generate();

    fireEvent.click(screen.getByRole('button', { name: 'Add to module' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(cc().upsertSubmodule).toHaveBeenCalledTimes(2);
    expect(cc().upsertSubmodule).toHaveBeenNthCalledWith(1, expect.objectContaining({
      module_id: 'mod-1', title: 'The Harbor Bribe', submodule_type: 'social', sort_order: 0,
    }));
    expect(cc().upsertSubmodule).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: 'The Dive', sort_order: 1,
    }));

    expect(cc().upsertScene).toHaveBeenCalledTimes(2);
    expect(cc().upsertScene).toHaveBeenNthCalledWith(1, expect.objectContaining({
      submodule_id: 'new-The-Harbor-Bribe', title: 'The Toll Office', sort_order: 0,
    }));
    expect(cc().upsertScene).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: 'Cutting Him Out', sort_order: 1,
    }));

    expect(onCreated).toHaveBeenCalledWith('new-The-Harbor-Bribe');
  });

  it('appends below the module\'s existing submodules', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    renderModal({ existing: [makeSubmodule('s1'), makeSubmodule('s2')] });
    await generate();

    fireEvent.click(screen.getByRole('button', { name: 'Add to module' }));
    await waitFor(() => expect(cc().upsertSubmodule).toHaveBeenCalledTimes(2));
    expect(cc().upsertSubmodule).toHaveBeenNthCalledWith(1, expect.objectContaining({ sort_order: 2 }));
    expect(cc().upsertSubmodule).toHaveBeenNthCalledWith(2, expect.objectContaining({ sort_order: 3 }));
  });

  it('skips a submodule the DM unchecks, and its scenes with it', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    await generate();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 of 2 submodules · 0 scenes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add to module' }));
    await waitFor(() => expect(cc().upsertSubmodule).toHaveBeenCalledTimes(1));
    expect(cc().upsertSubmodule).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Dive' }));
    expect(cc().upsertScene).not.toHaveBeenCalled();
  });

  it('disables saving when everything is unchecked', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    await generate();

    screen.getAllByRole('checkbox').forEach(c => fireEvent.click(c));
    expect(screen.getByRole('button', { name: 'Add to module' }).hasAttribute('disabled')).toBe(true);
  });

  it('surfaces a server error instead of writing anything', async () => {
    mockFetch({ error: 'Rate limited' }, false);
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await screen.findByText(/Generation failed: Rate limited/);
    expect(cc().upsertSubmodule).not.toHaveBeenCalled();
  });

  it('refuses to generate when there is no synopsis and no description', async () => {
    const f = mockFetch({ text: JSON.stringify(TREE) });
    renderModal({ module: makeModule('m', 'active', { title: 'Blank', synopsis: null }) });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await screen.findByText(/no synopsis yet/);
    expect(f).not.toHaveBeenCalled();
  });

  it('validates the counts before calling the API', async () => {
    const f = mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    // [0] is the submodule count, [1] the scenes-per count (FormField labels
    // aren't wired to their inputs, so query by role).
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await screen.findByText(/Number of submodules must be between/);
    expect(f).not.toHaveBeenCalled();
  });

  it('"Start over" returns to the form without writing', async () => {
    mockFetch({ text: JSON.stringify(TREE) });
    renderModal();
    await generate();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(cc().upsertSubmodule).not.toHaveBeenCalled();
  });
});
