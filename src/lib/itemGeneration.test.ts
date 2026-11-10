import { describe, it, expect } from 'vitest';
import { buildItemPrompt, parseGeneratedItem, type ItemRequest } from './itemGeneration';

const request = (over: Partial<ItemRequest> = {}): ItemRequest => ({
  type: 'any', rarity: 'any', idea: '', edition: '2014', context: '', existingNames: [], ...over,
});

describe('buildItemPrompt', () => {
  it('asks for the kind, rarity and edition the DM picked, with their idea and context', () => {
    const prompt = buildItemPrompt(request({
      type: 'wondrous', rarity: 'very_rare', idea: ' a lantern that shows ghosts ', edition: '2024',
      context: '\n\n== SELECTED CONTEXT ==\nNPCs: Sable', existingNames: ['Flame Tongue', ''],
    }));
    expect(prompt).toContain('one new D&D 5e wondrous item');
    expect(prompt).toContain('the 2024 rules');
    expect(prompt).toContain('very rare magic item');
    expect(prompt).toContain('What the DM has in mind: a lantern that shows ghosts');
    expect(prompt).toContain('== SELECTED CONTEXT ==');
    expect(prompt).toContain('already has these items, so make something different: Flame Tongue.');
    expect(prompt).toContain('"item_type": "weapon|armor|');
  });

  it('leaves the choice open on “Any”, and asks for nothing magic on “Not magic”', () => {
    expect(buildItemPrompt(request())).toContain('one new D&D 5e item');
    expect(buildItemPrompt(request())).toContain('Pick a rarity that suits it');
    expect(buildItemPrompt(request({ rarity: 'none' }))).toContain('It is NOT magic');
    expect(buildItemPrompt(request())).not.toContain('already has these items');
  });
});

describe('parseGeneratedItem', () => {
  const reply = (o: Record<string, unknown>) => JSON.stringify({
    name: 'Lantern of the Drowned', item_type: 'Wondrous item', rarity: 'Very Rare', attunement: true,
    attunement_note: 'by a cleric', value: '5,000 gp', description: 'Pale light.', dm_notes: 'Haunted.', ...o,
  });

  it('reads the item, in the app’s values, from a fenced reply', () => {
    expect(parseGeneratedItem('Here you go:\n```json\n' + reply({ bogus: 1 }) + '\n```')).toEqual({
      name: 'Lantern of the Drowned', item_type: 'wondrous', rarity: 'very_rare', attunement: true, attunement_note: 'by a cleric',
      value: '5,000 gp', description: 'Pale light.', dm_notes: 'Haunted.', image_path: null,
    });
  });

  it('keeps the kind and rarity the DM picked', () => {
    const out = parseGeneratedItem(reply({}), { type: 'ring', rarity: 'rare' });
    expect(out).toMatchObject({ item_type: 'ring', rarity: 'rare' });
  });

  it('makes a “Not magic” item mundane whatever the model said', () => {
    expect(parseGeneratedItem(reply({}), { type: 'any', rarity: 'none' }))
      .toMatchObject({ item_type: 'wondrous', rarity: null, attunement: false, attunement_note: null });
  });

  it('drops an attunement note on an item that needs none, and blanks empty text', () => {
    expect(parseGeneratedItem(reply({ attunement: false, value: '  ', dm_notes: null })))
      .toMatchObject({ attunement: false, attunement_note: null, value: null, dm_notes: null });
  });

  it('keeps text inside the item’s limits', () => {
    const out = parseGeneratedItem(reply({ name: 'N'.repeat(500), description: 'x'.repeat(20_000) }));
    expect(out.name).toHaveLength(120);
    expect(out.description).toHaveLength(8_000);
  });

  it('says what went wrong with a reply it can’t use', () => {
    expect(() => parseGeneratedItem('Sorry, I can’t.')).toThrow(/didn’t send back an item/);
    expect(() => parseGeneratedItem('{ "name": "Unclosed }')).toThrow(/wasn’t readable/);
    expect(() => parseGeneratedItem(reply({ name: ' ' }))).toThrow(/without a name/);
  });
});
