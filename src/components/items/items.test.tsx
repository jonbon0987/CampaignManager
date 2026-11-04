import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { ItemsContext, type ItemsValue } from '../../context/items';
import type { Item, ItemHolding } from '../../lib/database.types';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, open: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.open }));

import { HoldingList } from './HoldingList';
import { GiveItem } from './GiveItem';
import { PCInventory, SessionLoot } from './ItemPlaces';

const item = (id: string, name: string, over: Partial<Item> = {}): Item => ({
  id, name, user_id: 'u', campaign_id: 'c1', item_type: null, rarity: null, attunement: false, attunement_note: null,
  value: null, description: null, dm_notes: null, image_path: null, created_at: '', updated_at: '', ...over,
});
const holding = (id: string, item_id: string, pc_id: string | null, over: Partial<ItemHolding> = {}): ItemHolding => ({
  id, item_id, pc_id, user_id: 'u', campaign_id: 'c1', quantity: 1, attuned: false, session_id: null, note: null, created_at: '', updated_at: '', ...over,
});

const sword = item('i1', 'Flame Tongue', { item_type: 'weapon', rarity: 'rare', attunement: true });
const potion = item('i2', 'Potion of Healing', { item_type: 'potion', rarity: 'common' });

function items(over: Partial<ItemsValue> = {}): ItemsValue {
  return {
    items: [sword, potion],
    holdings: [holding('h1', 'i1', 'p1', { attuned: true }), holding('h2', 'i2', null, { quantity: 2, session_id: 's1' })],
    loaded: true,
    saveItem: vi.fn(async i => ({ ...item('new', ''), ...i })),
    deleteItem: vi.fn(),
    give: vi.fn(async x => holding('hn', x.item_id, x.pc_id)),
    updateHolding: vi.fn(),
    removeHolding: vi.fn(),
    treasury: [],
    addTreasury: vi.fn().mockResolvedValue(undefined),
    removeTreasury: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const show = (value: ItemsValue, ui: React.ReactNode) => render(<ItemsContext.Provider value={value}>{ui}</ItemsContext.Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  h.campaign.value = makeCampaignContext({
    pcs: [{ id: 'p1', character_name: 'Kael', is_active: true }, { id: 'p2', character_name: 'Mira', is_active: true }],
    sessions: [{ id: 's1', session_number: 4, title: null }],
  });
});

describe('PCInventory', () => {
  it('lists what the PC carries, and opens an item', () => {
    const value = items();
    show(value, <PCInventory pcId="p1" />);
    expect(screen.getByText('Rare weapon, requires attunement')).toBeTruthy();
    expect(screen.queryByText('Potion of Healing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Flame Tongue' }));
    expect(h.open).toHaveBeenCalledWith('items', 'i1');
  });

  it('marks attunement, only on an item that needs it', () => {
    const value = items({ holdings: [holding('h1', 'i1', 'p1'), holding('h3', 'i2', 'p1')] });
    show(value, <PCInventory pcId="p1" />);
    const boxes = screen.getAllByRole('checkbox', { name: 'Attuned' });
    expect(boxes).toHaveLength(1);
    fireEvent.click(boxes[0]);
    expect(value.updateHolding).toHaveBeenCalledWith(value.holdings[0], { attuned: true });
  });

  it('saves a count when the DM leaves the field', () => {
    const value = items();
    show(value, <PCInventory pcId="p1" />);
    const qty = screen.getByRole('spinbutton', { name: 'How many Flame Tongue' });
    fireEvent.change(qty, { target: { value: '3' } });
    expect(value.updateHolding).not.toHaveBeenCalled();
    fireEvent.blur(qty);
    expect(value.updateHolding).toHaveBeenCalledWith(value.holdings[0], { quantity: 3 });
  });

  it('takes an item away', () => {
    const value = items();
    show(value, <PCInventory pcId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Take away Flame Tongue' }));
    expect(value.removeHolding).toHaveBeenCalledWith(value.holdings[0]);
  });

  it('says when they carry nothing', () => {
    show(items(), <PCInventory pcId="p2" />);
    expect(screen.getByText('Carrying nothing from the item list yet.')).toBeTruthy();
  });

  it('shows nothing outside a campaign', () => {
    const { container } = render(<PCInventory pcId="p1" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('SessionLoot', () => {
  it('lists what the session handed out, and to whom', () => {
    const value = items();
    show(value, <SessionLoot sessionId="s1" />);
    const row = screen.getByText('Potion of Healing').closest('li')!;
    expect((within(row).getByRole('combobox', { name: 'Who has Potion of Healing' }) as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(row).getByRole('combobox', { name: 'Who has Potion of Healing' }), { target: { value: 'p2' } });
    expect(value.updateHolding).toHaveBeenCalledWith(value.holdings[1], { pc_id: 'p2' });
    expect(screen.queryByText('Flame Tongue')).toBeNull();
  });
});

describe('GiveItem', () => {
  it('gives a known item to the chosen PC, from the session', async () => {
    const value = items();
    show(value, <GiveItem sessionId="s1" label="Hand out" />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Item' }), { target: { value: ' potion of healing ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Give to' }), { target: { value: 'p2' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'How many' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hand out' }));
    await waitFor(() => expect(value.give).toHaveBeenCalledWith({ item_id: 'i2', pc_id: 'p2', quantity: 2, session_id: 's1' }));
    expect(value.saveItem).not.toHaveBeenCalled();
  });

  it('makes an item the compendium doesn’t have yet', async () => {
    const value = items();
    show(value, <GiveItem pcId="p1" label="Add" />);
    expect(screen.queryByRole('combobox', { name: 'Give to' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Item' }), { target: { value: 'Bag of Holding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(value.give).toHaveBeenCalledWith({ item_id: 'new', pc_id: 'p1', quantity: 1, session_id: null }));
    expect(value.saveItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bag of Holding', rarity: null }));
  });

  it('gives the item on its own page to the party by default', async () => {
    const value = items();
    show(value, <GiveItem itemId="i1" label="Give" />);
    expect(screen.queryByRole('combobox', { name: 'Item' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));
    await waitFor(() => expect(value.give).toHaveBeenCalledWith({ item_id: 'i1', pc_id: null, quantity: 1, session_id: null }));
  });

  it('waits for a name, and says why a give failed', async () => {
    const value = items({ give: vi.fn().mockRejectedValue(new Error('Offline')) });
    show(value, <GiveItem pcId="p1" label="Add" />);
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Item' }), { target: { value: 'Flame Tongue' } });
    fireEvent.click(add);
    expect((await screen.findByRole('alert')).textContent).toBe('Offline');
  });
});

describe('HoldingList', () => {
  it('lists a deleted PC’s things under the party', () => {
    const value = items({ holdings: [holding('h9', 'i2', 'gone')] });
    show(value, <HoldingList holdings={value.holdings} showItem showHolder />);
    expect(screen.getByRole('option', { name: 'The party', selected: true })).toBeTruthy();
  });
});
