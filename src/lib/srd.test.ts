import { describe, it, expect } from 'vitest';
import { CR_XP } from './encounterScaling';
import { baseType, filterItems, filterMonsters, loadSrdItems, loadSrdMonsters, srdToItem, srdToStatblock, type SrdItem, type SrdMonster } from './srd';

const goblin: SrdMonster = {
  id: 'goblin', name: 'Goblin', size: 'Small', type: 'humanoid', subtype: 'goblinoid', alignment: 'neutral evil',
  cr: '1/4', xp: 50, ac: 15, acNote: 'leather armor, shield', hp: 7, hitDice: '2d6', speed: '30 ft.',
  str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, skills: 'Stealth +6',
  senses: 'darkvision 60 ft., passive Perception 9', languages: 'Common, Goblin',
  text: 'Actions\nScimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
};
const rats = { ...goblin, id: 'swarm-of-rats', name: 'Swarm of Rats', type: 'swarm of tiny beasts', subtype: undefined, cr: '1/4', vulnerabilities: 'fire' };
const dragon = { ...goblin, id: 'adult-red-dragon', name: 'Adult Red Dragon', type: 'dragon', subtype: undefined, cr: '17' };

describe('SRD monsters', () => {
  it('files swarms under their creature type', () => {
    expect(baseType('swarm of tiny beasts')).toBe('beast');
    expect(baseType('swarm of tiny undead')).toBe('undead');
    expect(baseType('dragon')).toBe('dragon');
    expect(baseType('mystery')).toBe('other');
  });

  it('filters by name, type and a CR range', () => {
    const all = [goblin, rats, dragon];
    expect(filterMonsters(all, { q: 'gob' }).map(m => m.id)).toEqual(['goblin']);
    expect(filterMonsters(all, { type: 'beast' }).map(m => m.id)).toEqual(['swarm-of-rats']);
    expect(filterMonsters(all, { minCr: '1' }).map(m => m.id)).toEqual(['adult-red-dragon']);
    expect(filterMonsters(all, { maxCr: '1/2' }).map(m => m.id)).toEqual(['goblin', 'swarm-of-rats']);
  });

  it('becomes a stat sheet with the type line, vulnerabilities and a source tag', () => {
    const s = srdToStatblock(goblin, '2014');
    expect(s).toMatchObject({ name: 'Goblin', creature_type: 'humanoid', challenge_rating: '1/4', armor_class: 15, ac_descriptor: 'leather armor, shield', hit_points: 7, skills: 'Stealth +6', saving_throws: null });
    expect(s.content).toMatch(/^Small humanoid \(goblinoid\), neutral evil\n\nActions\nScimitar/);
    expect(s.tags).toBe('SRD 5.1, small, goblinoid');
    const r = srdToStatblock(rats, '2024');
    expect(r.creature_type).toBe('beast');
    expect(r.content).toContain('Damage Vulnerabilities: fire\n\nActions');
    expect(r.tags).toBe('SRD 5.2.1, small');
  });
});

describe('SRD items', () => {
  const cloak: SrdItem = { id: 'cloak-of-elvenkind', name: 'Cloak of Elvenkind', type: 'wondrous', rarity: 'uncommon', rarityText: 'Uncommon', attunement: true, line: 'Wondrous item, uncommon (requires attunement)', text: 'While you wear this cloak…' };
  const staff: SrdItem = { ...cloak, id: 'staff-of-power', name: 'Staff of Power', type: 'staff', rarity: 'very_rare', attunementNote: 'by a sorcerer, warlock, or wizard', line: 'Staff, very rare (requires attunement by a sorcerer, warlock, or wizard)' };

  it('filters by name, type and rarity', () => {
    expect(filterItems([cloak, staff], { q: 'elven' }).map(i => i.id)).toEqual(['cloak-of-elvenkind']);
    expect(filterItems([cloak, staff], { type: 'staff' }).map(i => i.id)).toEqual(['staff-of-power']);
    expect(filterItems([cloak, staff], { rarity: 'uncommon' }).map(i => i.id)).toEqual(['cloak-of-elvenkind']);
  });

  it('becomes an item with its first line leading the description', () => {
    expect(srdToItem(staff)).toMatchObject({ name: 'Staff of Power', item_type: 'staff', rarity: 'very_rare', attunement: true, attunement_note: 'by a sorcerer, warlock, or wizard', value: null });
    expect(srdToItem(cloak).description).toBe('Wondrous item, uncommon (requires attunement)\n\nWhile you wear this cloak…');
  });
});

describe('SRD data', () => {
  it('loads both editions, with every CR rateable and every type a stat sheet type', async () => {
    for (const ed of ['2014', '2024'] as const) {
      const [monsters, items] = await Promise.all([loadSrdMonsters(ed), loadSrdItems(ed)]);
      expect(monsters.length).toBeGreaterThan(300);
      expect(items.length).toBeGreaterThan(250);
      expect(monsters.filter(m => baseType(m.type) === 'other')).toEqual([]);
      expect(monsters.filter(m => CR_XP[m.cr] == null).map(m => m.name)).toEqual([]);
      expect(monsters.find(m => m.name.startsWith('Goblin'))).toBeTruthy();
    }
  });
});
