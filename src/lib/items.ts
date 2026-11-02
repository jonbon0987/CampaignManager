// Items and loot: the kinds of item, their rarities, and how an item and
// its holders are described ("Rare weapon", "Kael and the party").

import type { Item, ItemHolding, PlayerCharacter } from './database.types';

export const ITEM_TYPES: { id: string; label: string }[] = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'armor', label: 'Armor' },
  { id: 'potion', label: 'Potion' },
  { id: 'scroll', label: 'Scroll' },
  { id: 'ring', label: 'Ring' },
  { id: 'rod', label: 'Rod' },
  { id: 'staff', label: 'Staff' },
  { id: 'wand', label: 'Wand' },
  { id: 'wondrous', label: 'Wondrous item' },
  { id: 'gear', label: 'Gear' },
  { id: 'treasure', label: 'Treasure' },
  { id: 'other', label: 'Other' },
];

export type BadgeColor = 'blue' | 'green' | 'red' | 'gold' | 'muted' | 'orange';

/** Rarities, rarest last. No rarity means the item isn't magic. */
export const RARITIES: { id: string; label: string; color: BadgeColor }[] = [
  { id: 'common', label: 'Common', color: 'muted' },
  { id: 'uncommon', label: 'Uncommon', color: 'green' },
  { id: 'rare', label: 'Rare', color: 'blue' },
  { id: 'very_rare', label: 'Very rare', color: 'orange' },
  { id: 'legendary', label: 'Legendary', color: 'gold' },
  { id: 'artifact', label: 'Artifact', color: 'red' },
];

export const itemTypeLabel = (id: string | null) => ITEM_TYPES.find(t => t.id === id)?.label ?? null;
export const rarity = (id: string | null) => RARITIES.find(r => r.id === id) ?? null;

/** "Rare wondrous item, requires attunement by a wizard", or "Gear". */
export function itemLine(item: Pick<Item, 'item_type' | 'rarity' | 'attunement' | 'attunement_note'>): string {
  const type = itemTypeLabel(item.item_type);
  const r = rarity(item.rarity);
  const kind = r && type ? `${r.label} ${type.toLowerCase()}` : r?.label ?? type ?? '';
  if (!item.attunement) return kind;
  const attune = `requires attunement${item.attunement_note?.trim() ? ` ${item.attunement_note.trim()}` : ''}`;
  return kind ? `${kind}, ${attune}` : attune.charAt(0).toUpperCase() + attune.slice(1);
}

/** Who holds it: a PC's name, or the party (also for a PC since deleted, whose things the party keeps). */
export function holderName(holding: Pick<ItemHolding, 'pc_id'>, pcs: Pick<PlayerCharacter, 'id' | 'character_name'>[]): string {
  const pc = holding.pc_id ? pcs.find(p => p.id === holding.pc_id) : undefined;
  if (!pc) return 'The party';
  return pc.character_name || 'Unnamed character';
}

/** For a list row: "Kael", "Kael and the party", "3 holders", or "" when no one has it. */
export function holdersSummary(holdings: Pick<ItemHolding, 'pc_id'>[], pcs: Pick<PlayerCharacter, 'id' | 'character_name'>[]): string {
  const names = [...new Set(holdings.map(h => holderName(h, pcs)))];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1].replace(/^The party$/, 'the party')}`;
  return `${names.length} holders`;
}

/** A new item with only a name, to fill in later. */
export function blankItem(name = ''): Omit<Item, 'id' | 'user_id' | 'campaign_id' | 'created_at' | 'updated_at'> {
  return { name, item_type: null, rarity: null, attunement: false, attunement_note: null, value: null, description: null, dm_notes: null, image_path: null };
}
