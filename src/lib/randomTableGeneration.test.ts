import { describe, it, expect } from 'vitest';
import {
  buildTablePrompt,
  buildEntryPrompt,
  rawToEntry,
  parseGeneratedTable,
  parseGeneratedEntry,
} from './randomTableGeneration';
import { RARITY_WEIGHTS } from './randomEncounter';

describe('prompts', () => {
  it('buildTablePrompt names the kind, count, region and kind-specific fields', () => {
    const p = buildTablePrompt({ kind: 'treasure', region: 'Frostpeak', count: 8 });
    expect(p).toContain('Treasure');
    expect(p).toContain('Frostpeak');
    expect(p).toContain('Return exactly 8 entries.');
    expect(p).toContain('"coins"');
  });
  it('encounter table prompt lists bestiary names', () => {
    const p = buildTablePrompt({ kind: 'encounter', count: 5, bestiaryNames: ['Wolf', 'Dire Wolf'] });
    expect(p).toContain('- Wolf');
    expect(p).toContain('"creatures"');
  });
  it('buildEntryPrompt avoids duplicates', () => {
    const p = buildEntryPrompt({ kind: 'wild', existingNames: ['Time Skip', 'Rain of Frogs'] });
    expect(p).toContain('Do NOT duplicate');
    expect(p).toContain('Time Skip');
    expect(p).toContain('"effect"');
  });
});

describe('rawToEntry', () => {
  it('maps rarity to weight and defaults to common', () => {
    expect(rawToEntry('custom', { name: 'x', rarity: 'rare' }).weight).toBe(RARITY_WEIGHTS.rare);
    expect(rawToEntry('custom', { name: 'x' }).weight).toBe(RARITY_WEIGHTS.common);
    expect(rawToEntry('custom', { name: 'x', rarity: 'bogus' }).rarity).toBe('common');
  });

  it('encounter: sets entryKind and links creatures by name (case-insensitive)', () => {
    const byName = new Map([['wolf', 'sb-wolf'], ['dire wolf', 'sb-dire']]);
    const e = rawToEntry('encounter', { name: 'Pack', type: 'social', creatures: ['Wolf', 'DIRE WOLF', 'Unknown'] }, byName);
    expect(e.entryKind).toBe('social');
    expect(e.creatures).toEqual([{ id: 'sb-wolf', note: null }, { id: 'sb-dire', note: null }]);
  });

  it('encounter: defaults entryKind to combat and dedupes creatures', () => {
    const byName = new Map([['wolf', 'sb-wolf']]);
    const e = rawToEntry('encounter', { name: 'x', creatures: ['Wolf', 'wolf'] }, byName);
    expect(e.entryKind).toBe('combat');
    expect(e.creatures).toEqual([{ id: 'sb-wolf', note: null }]);
  });

  it('treasure/magic/wild/custom carry their kind fields', () => {
    expect(rawToEntry('treasure', { name: 'H', coins: '4d6 gp', valuables: 'gem', magicItem: 'potion' }))
      .toMatchObject({ coins: '4d6 gp', valuables: 'gem', magicItem: 'potion' });
    expect(rawToEntry('magic', { name: 'M', itemType: 'Wondrous item', attunement: true, itemText: 'glows' }))
      .toMatchObject({ itemType: 'Wondrous item', attunement: true, itemText: 'glows' });
    expect(rawToEntry('wild', { name: 'W', effect: 'you teleport' }).effect).toBe('you teleport');
    expect(rawToEntry('custom', { name: 'C', card: 'doom' }).cardKind).toBe('doom');
    expect(rawToEntry('custom', { name: 'C', card: 'none' }).cardKind).toBeUndefined();
  });
});

describe('parseGeneratedTable', () => {
  it('parses name/subtitle/entries from a fenced JSON block', () => {
    const text = '```json\n' + JSON.stringify({
      name: 'Whitewood Wilds', subtitle: 'the deep forest',
      entries: [{ name: 'Wolves', description: 'a pack', rarity: 'common' }],
    }) + '\n```';
    const t = parseGeneratedTable('encounter', text);
    expect(t.name).toBe('Whitewood Wilds');
    expect(t.subtitle).toBe('the deep forest');
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].name).toBe('Wolves');
  });
  it('drops empty entries and throws when none remain', () => {
    const text = JSON.stringify({ entries: [{ name: '', description: '' }] });
    expect(() => parseGeneratedTable('custom', text)).toThrow();
  });
});

describe('parseGeneratedEntry', () => {
  it('parses a single entry', () => {
    const text = JSON.stringify({ name: 'Rain of Frogs', description: 'plip', rarity: 'uncommon', effect: 'frogs' });
    const e = parseGeneratedEntry('wild', text);
    expect(e.name).toBe('Rain of Frogs');
    expect(e.effect).toBe('frogs');
    expect(e.weight).toBe(RARITY_WEIGHTS.uncommon);
  });
  it('throws on an empty entry', () => {
    expect(() => parseGeneratedEntry('custom', JSON.stringify({}))).toThrow();
  });
});
