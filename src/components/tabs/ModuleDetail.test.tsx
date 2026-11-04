import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeModule, makeScene, makeSubmodule } from '../../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as Record<string, unknown> | null }, confirm: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../hooks/useHandouts', () => ({ useHandouts: () => ({ handouts: [], adding: false, add: vi.fn(), rename: vi.fn(), remove: vi.fn() }) }));
vi.mock('../handouts/HandoutGallery', () => ({ HandoutGallery: () => null }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) =>
    <textarea aria-label={placeholder} value={value ?? ''} onChange={e => onChange(e.target.value)} />,
}));

import ModuleDetail from './ModuleDetail';

const mod = makeModule('m1', 'active', { title: 'The Sunken Crown' });
const parts = [
  makeSubmodule('p1', { module_id: 'm1', title: 'The Vaults', sort_order: 0, submodule_type: 'location' }),
  makeSubmodule('p2', { module_id: 'm1', title: 'The Claim', sort_order: 1, submodule_type: 'location' }),
];
const scenes = [
  makeScene('s2', { submodule_id: 'p1', title: 'Second', sort_order: 1, scene_type: 'encounter', summary: 'They fight' }),
  makeScene('s1', { submodule_id: 'p1', title: 'First', sort_order: 0, scene_type: 'encounter', read_aloud: 'Water drips.' }),
  makeScene('s3', { submodule_id: 'p2', title: 'Third', sort_order: 0, scene_type: 'social' }),
];

function show(initial?: string, over = {}) {
  const upsertScene = vi.fn(async s => ({ ...makeScene('new'), ...s }));
  const deleteScene = vi.fn().mockResolvedValue(undefined);
  const onPartChange = vi.fn();
  h.campaign.value = makeCampaignContext({
    submodules: parts, scenes, submoduleDeps: [], loadSubmoduleDeps: vi.fn(), monsterStatblocks: [], encounters: [],
    upsertScene, deleteScene, ...over,
  });
  const view = render(<ModuleDetail module={mod} onBack={vi.fn()} onModuleDeleted={vi.fn()} target={{ id: initial ?? null, n: 1 }} onPartChange={onPartChange} />);
  const askFor = (id: string | null, n: number) => view.rerender(<ModuleDetail module={mod} onBack={vi.fn()} onModuleDeleted={vi.fn()} target={{ id, n }} onPartChange={onPartChange} />);
  return { upsertScene, deleteScene, onPartChange, askFor };
}

const title = () => (screen.getByLabelText('Scene title') as HTMLTextAreaElement).value;
const outline = () => within(document.querySelector('aside')!);

beforeEach(() => { vi.clearAllMocks(); h.confirm = makeConfirm(true); });

describe('a scene as its own page', () => {
  it('opens straight from its id, as a link does, with its part open in the outline', async () => {
    const { onPartChange } = show('s2');
    expect(title()).toBe('Second');
    expect(screen.getByText(/Scene 2 of 2/)).toBeTruthy();
    expect(outline().getByRole('button', { name: /2\. Second/ }).getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(onPartChange).toHaveBeenCalledWith('s2'));
  });

  it('opens from the outline', () => {
    show('p1');
    fireEvent.click(outline().getByRole('button', { name: /1\. First/ }));
    expect(title()).toBe('First');
    expect(screen.getByDisplayValue('Water drips.')).toBeTruthy();
  });

  it('opens from its part’s list of scenes, in order, and the list has no delete button', () => {
    show('p1');
    const list = document.querySelector('.md-scene-list') as HTMLElement;
    expect([...list.querySelectorAll('.md-scene-name')].map(n => n.textContent)).toEqual(['First', 'Second']);
    expect(within(list).queryByTitle('Delete scene')).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: /Second.*They fight/ }));
    expect(title()).toBe('Second');
  });

  it('walks every scene in the module, across parts, with Prev and Next', async () => {
    show('s2');
    expect(screen.getByRole('button', { name: '‹ First' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Third ›' }));
    await waitFor(() => expect(title()).toBe('Third'));
    expect((screen.getByRole('button', { name: 'Last scene ›' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '‹ Second' }));
    await waitFor(() => expect(title()).toBe('Second'));
  });

  it('marks each kind with a glyph as well as a colour', () => {
    show('p1');
    const row = document.querySelector('.md-scene-row .md-glyph') as HTMLElement;
    expect(row.textContent).toBeTruthy();
    expect(row.title).toBeTruthy();
  });

  it('saves what’s typed, and goes back to its part from the eyebrow', async () => {
    const { upsertScene } = show('s1');
    fireEvent.change(screen.getByLabelText('The beat'), { target: { value: 'The gate groans' } });
    fireEvent.click(screen.getByRole('button', { name: 'The Vaults' }));
    await waitFor(() => expect(upsertScene).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', summary: 'The gate groans', sort_order: 0 })));
    await waitFor(() => expect(screen.getByText(/Part 1 of 2/)).toBeTruthy());
  });

  it('adds a scene and opens it', async () => {
    const made = makeScene('new', { submodule_id: 'p1', title: 'New scene', sort_order: 2, scene_type: 'encounter' });
    const upsertScene = vi.fn().mockImplementation(async () => {
      h.campaign.value = { ...h.campaign.value!, scenes: [...scenes, made] };
      return made;
    });
    const { rerender } = (() => {
      h.campaign.value = makeCampaignContext({ submodules: parts, scenes, submoduleDeps: [], loadSubmoduleDeps: vi.fn(), monsterStatblocks: [], encounters: [], upsertScene });
      return render(<ModuleDetail module={mod} onBack={vi.fn()} onModuleDeleted={vi.fn()} target={{ id: 'p1', n: 1 }} />);
    })();
    fireEvent.click(screen.getByRole('button', { name: '＋ Scene' }));
    await waitFor(() => expect(upsertScene).toHaveBeenCalled());
    rerender(<ModuleDetail module={mod} onBack={vi.fn()} onModuleDeleted={vi.fn()} target={{ id: 'p1', n: 1 }} />);
    await waitFor(() => expect(title()).toBe('New scene'));
  });

  it('follows Back: a new request moves there, even to a scene it was first asked for', async () => {
    const { askFor } = show('s2');
    fireEvent.click(screen.getByRole('button', { name: 'Third ›' }));
    await waitFor(() => expect(title()).toBe('Third'));
    askFor('s2', 2);
    await waitFor(() => expect(title()).toBe('Second'));
    askFor(null, 3);
    await waitFor(() => expect(screen.queryByLabelText('Scene title')).toBeNull());
  });

  it('falls back to the overview for an id that isn’t in this module', async () => {
    const { onPartChange } = show('nowhere');
    await waitFor(() => expect(onPartChange).toHaveBeenLastCalledWith(null));
  });
});
