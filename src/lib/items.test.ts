import { describe, it, expect } from 'vitest';
import { blankItem, holderName, holdersSummary, itemLine, itemTypeLabel, rarity } from './items';

const pcs = [{ id: 'p1', character_name: 'Kael' }, { id: 'p2', character_name: '' }];

describe('itemLine', () => {
  const line = (over: Partial<Parameters<typeof itemLine>[0]>) =>
    itemLine({ item_type: null, rarity: null, attunement: false, attunement_note: null, ...over });

  it('names rarity and type together', () => {
    expect(line({ item_type: 'weapon', rarity: 'rare' })).toBe('Rare weapon');
    expect(line({ item_type: 'wondrous', rarity: 'very_rare' })).toBe('Very rare wondrous item');
  });

  it('gets by with either alone, or neither', () => {
    expect(line({ item_type: 'gear' })).toBe('Gear');
    expect(line({ rarity: 'legendary' })).toBe('Legendary');
    expect(line({})).toBe('');
  });

  it('adds attunement, and who can attune', () => {
    expect(line({ item_type: 'ring', rarity: 'uncommon', attunement: true })).toBe('Uncommon ring, requires attunement');
    expect(line({ item_type: 'staff', rarity: 'rare', attunement: true, attunement_note: ' by a wizard ' }))
      .toBe('Rare staff, requires attunement by a wizard');
    expect(line({ attunement: true })).toBe('Requires attunement');
  });
});

describe('labels', () => {
  it('reads type and rarity ids, and nothing for an unknown one', () => {
    expect(itemTypeLabel('potion')).toBe('Potion');
    expect(itemTypeLabel(null)).toBeNull();
    expect(rarity('artifact')).toEqual({ id: 'artifact', label: 'Artifact', color: 'red' });
    expect(rarity('mythic')).toBeNull();
  });
});

describe('holders', () => {
  it('names a PC, an unnamed PC, and the party', () => {
    expect(holderName({ pc_id: 'p1' }, pcs)).toBe('Kael');
    expect(holderName({ pc_id: 'p2' }, pcs)).toBe('Unnamed character');
    expect(holderName({ pc_id: null }, pcs)).toBe('The party');
  });

  it('gives a deleted PC’s things to the party', () => {
    expect(holderName({ pc_id: 'gone' }, pcs)).toBe('The party');
  });

  it('sums up who holds an item', () => {
    expect(holdersSummary([], pcs)).toBe('');
    expect(holdersSummary([{ pc_id: 'p1' }, { pc_id: 'p1' }], pcs)).toBe('Kael');
    expect(holdersSummary([{ pc_id: 'p1' }, { pc_id: null }], pcs)).toBe('Kael and the party');
    expect(holdersSummary([{ pc_id: 'p1' }, { pc_id: 'p2' }, { pc_id: null }], pcs)).toBe('3 holders');
  });
});

describe('blankItem', () => {
  it('is a name and nothing else', () => {
    expect(blankItem('Bag of Holding')).toEqual({
      name: 'Bag of Holding', item_type: null, rarity: null, attunement: false, attunement_note: null,
      value: null, description: null, dm_notes: null, image_path: null,
    });
  });
});
