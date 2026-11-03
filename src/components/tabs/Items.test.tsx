import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { ItemsContext, type ItemsValue } from '../../context/items';
import type { Item, ItemHolding } from '../../lib/database.types';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, confirm: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <textarea aria-label="rich text" value={value ?? ''} onChange={e => onChange(e.target.value)} />,
}));
vi.mock('../ui/ImageSlot', () => ({ ImageSlot: () => null }));
vi.mock('../ui/ImageThumb', () => ({ ImageThumb: () => null }));

import Items from './Items';

const item = (id: string, name: string, over: Partial<Item> = {}): Item => ({
  id, name, user_id: 'u', campaign_id: 'c1', item_type: null, rarity: null, attunement: false, attunement_note: null,
  value: null, description: null, dm_notes: null, image_path: null, created_at: '', updated_at: '', ...over,
});
const holding = (id: string, item_id: string, pc_id: string | null): ItemHolding => ({
  id, item_id, pc_id, user_id: 'u', campaign_id: 'c1', quantity: 1, attuned: false, session_id: null, note: null, created_at: '', updated_at: '',
});

function items(over: Partial<ItemsValue> = {}): ItemsValue {
  return {
    items: [
      item('i1', 'Flame Tongue', { item_type: 'weapon', rarity: 'rare', attunement: true }),
      item('i2', 'Crown of the Drowned King', { item_type: 'treasure', description: 'Barnacled gold.' }),
    ],
    holdings: [holding('h1', 'i1', 'p1'), holding('h2', 'i1', null)],
    loaded: true,
    saveItem: vi.fn(async i => ({ ...item('new', ''), ...i })),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    give: vi.fn(),
    updateHolding: vi.fn(),
    removeHolding: vi.fn(),
    ...over,
  };
}

const show = (value: ItemsValue) => render(<ItemsContext.Provider value={value}><Items /></ItemsContext.Provider>);

describe('Items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.campaign.value = makeCampaignContext({ pcs: [{ id: 'p1', character_name: 'Kael', is_active: true }], sessions: [] });
    h.confirm.mockResolvedValue(true);
  });

  it('lists items out in the world before the rest, with what they are and who has them', () => {
    show(items());
    expect(screen.getByText('With the party · 1')).toBeTruthy();
    expect(screen.getByText('Not handed out · 1')).toBeTruthy();
    expect(screen.getByText('Rare weapon, requires attunement')).toBeTruthy();
    expect(screen.getByText('Kael and the party')).toBeTruthy();
    expect(screen.getAllByText('Rare').some(el => el.closest('.cm-row'))).toBe(true);
  });

  it('finds items by name, kind or description', () => {
    show(items());
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'barnacle' } });
    expect(screen.queryByText('Flame Tongue')).toBeNull();
    expect(screen.getAllByText('Crown of the Drowned King').length).toBeGreaterThan(0);
  });

  it('adds an item and opens it', async () => {
    const value = items();
    show(value);
    fireEvent.click(screen.getByRole('button', { name: '+ Add ▾' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank item' }));
    await waitFor(() => expect(value.saveItem).toHaveBeenCalledWith(expect.objectContaining({ name: '' })));
  });

  it('copies a magic item in from the SRD library', async () => {
    const value = items();
    show(value);
    fireEvent.click(screen.getByRole('button', { name: '+ Add ▾' }));
    fireEvent.click(screen.getByRole('button', { name: 'From the SRD library…' }));
    const search = await screen.findByLabelText('Search magic items');
    fireEvent.change(search, { target: { value: 'cloak of elvenkind' } });
    await screen.findByText('1 of 362 magic items');
    expect(screen.getByText(/System Reference Document 5\.1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to items' }));
    await waitFor(() => expect(value.saveItem).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cloak of Elvenkind', item_type: 'wondrous', rarity: 'uncommon', attunement: true,
    })));
    await waitFor(() => expect(screen.queryByText('SRD magic items')).toBeNull());
  });

  it('says what to do when there are none', () => {
    show(items({ items: [], holdings: [] }));
    expect(screen.getByText(/No items yet/)).toBeTruthy();
  });

  it('edits the open item and saves it', async () => {
    const value = items();
    show(value);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Frost Brand' } });
    fireEvent.change(screen.getByLabelText('Rarity'), { target: { value: 'very_rare' } });
    await waitFor(() => expect(value.saveItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', name: 'Frost Brand', rarity: 'very_rare' })), { timeout: 2000 });
  });

  it('asks who can attune only once attunement is needed', () => {
    show(items());
    fireEvent.click(screen.getByText('Crown of the Drowned King'));
    expect(screen.queryByRole('textbox', { name: 'Attunement by' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not needed' }));
    expect(screen.getByRole('textbox', { name: 'Attunement by' })).toBeTruthy();
  });

  it('warns that holders lose a deleted item, and that it can be undone', async () => {
    const value = items();
    show(value);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete item' }));
    await waitFor(() => expect(value.deleteItem).toHaveBeenCalledWith('i1'));
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Whoever has it loses it too\. You can undo/) }));
  });
});
