import { describe, it, expect } from 'vitest';
import { npcFromFormFields, npcReadEnough, cleanNpcSheet, matchNPC, npcSheetChanges, mergedStatblock, NPC_GROUP, STATBLOCK_GROUP } from './npcSheet';
import { patchFrom } from './characterSheet';

// Field names as D&D Beyond's "Export to PDF" spells them; the character is made up.
const DDB = {
  CharacterName: 'Mara Vell', 'CLASS  LEVEL': 'Rogue 5', RACE: 'Half-Elf', BACKGROUND: 'Criminal', AC: '15', MaxHP: '33',
  STR: '10', DEX: '18', CON: '12', INT: '13', WIS: '11', CHA: '14',
  'ST Strength': '+0', 'ST Dexterity': '+7', 'ST Constitution': '+1', 'ST Intelligence': '+4', 'ST Wisdom': '+0', 'ST Charisma': '+2',
  Acrobatics: '+4', Stealth: '+10', Perception: '+3', Deception: '+5', Arcana: '+1',
  Passive1: '13', Speed: '30 ft. (Walking)', Total: '5d8', ProfBonus: '+3', SIZE: 'Medium',
  AdditionalSenses: 'Darkvision 60 ft.',
  ProficienciesLang: '=== ARMOR ===\nLight Armor\n\n=== LANGUAGES ===\nCommon, Elvish\nThieves’ Cant',
  'Wpn Name': 'Rapier', 'Wpn1 AtkBonus': '+7', 'Wpn1 Damage': '1d8+4 Piercing', 'Wpn Notes 1': 'Finesse',
  'Wpn Name 2': 'Shortbow', 'Wpn2 AtkBonus ': '7', 'Wpn2 Damage ': '1d6+4 Piercing',
  Appearance: 'Sharp-eyed, scarred hands.', Backstory: 'Ran with the Black Sails.', AlliesOrganizations: 'The Black Sails',
  'PersonalityTraits ': 'Always has a way out.', Flaws: 'Can’t resist a mark.',
};

describe('npcFromFormFields', () => {
  it('makes the NPC and a stat sheet from a D&D Beyond export', () => {
    const { npc, statblock } = npcFromFormFields(DDB);
    expect(npc).toEqual({
      name: 'Mara Vell',
      role: 'Half-Elf Rogue 5',
      description: '**Appearance.** Sharp-eyed, scarred hands.\n\n**Backstory.** Ran with the Black Sails.\n\n**Allies & organizations.** The Black Sails',
      hooks_motivations: '**Personality.** Always has a way out.\n\n**Flaws.** Can’t resist a mark.',
    });
    expect(statblock).toEqual({
      name: 'Mara Vell', creature_type: 'humanoid', armor_class: 15, hit_points: 33, hit_dice: '5d8+5', speed: '30 ft.',
      str: 10, dex: 18, con: 12, int: 13, wis: 11, cha: 14,
      saving_throws: 'Dex +7, Int +4',
      skills: 'Deception +5, Perception +3, Stealth +10',
      senses: 'darkvision 60 ft., passive Perception 13',
      languages: 'Common, Elvish, Thieves’ Cant',
      content: 'Medium humanoid (Half-Elf)\n\nHalf-Elf Rogue 5. Proficiency bonus +3.\n\nActions\nRapier. +7 to hit, 1d8+4 Piercing. Finesse.\nShortbow. +7 to hit, 1d6+4 Piercing.',
    });
    expect(npcReadEnough(npcFromFormFields(DDB))).toBe(true);
  });

  it('needs a name and some numbers', () => {
    expect(npcReadEnough(npcFromFormFields({ CharacterName: 'Mara' }))).toBe(false);
    expect(npcReadEnough(npcFromFormFields({ AC: '15' }))).toBe(false);
  });
});

describe('cleanNpcSheet', () => {
  it('cleans the assistant’s reading of a stat block, naming one from the other', () => {
    expect(cleanNpcSheet({
      npc: { name: '', role: 'Hill giant', description: null },
      statblock: { name: 'Hill Giant', creature_type: 'giant', challenge_rating: '5', armor_class: 13, hit_points: '105', str: 21, content: 'Actions\nGreatclub. +8 to hit.', bogus: 1 },
    })).toEqual({
      npc: { name: 'Hill Giant', role: 'Hill giant', description: undefined, hooks_motivations: undefined },
      statblock: { name: 'Hill Giant', creature_type: 'giant', challenge_rating: '5', armor_class: 13, hit_points: 105, str: 21, content: 'Actions\nGreatclub. +8 to hit.' },
    });
    expect(cleanNpcSheet(null)).toEqual({ npc: { name: undefined, role: undefined, description: undefined, hooks_motivations: undefined }, statblock: {} });
  });
});

describe('matching, changes and saving', () => {
  const sheet = npcFromFormFields(DDB);

  it('matches an NPC by name', () => {
    expect(matchNPC(sheet, [{ id: 'n1', name: 'mara  vell' }])?.id).toBe('n1');
    expect(matchNPC(sheet, [{ id: 'n1', name: 'Other' }])).toBeNull();
  });

  it('groups the changes to the NPC and to its stat sheet, and patches each group', () => {
    const changes = npcSheetChanges(sheet, { name: 'Mara Vell', role: 'Smuggler' }, { name: 'Mara Vell', armor_class: 15, hit_points: 20 });
    expect(changes.filter(c => c.group === NPC_GROUP).map(c => c.key)).toEqual(['role', 'description', 'hooks_motivations']);
    const sb = changes.filter(c => c.group === STATBLOCK_GROUP);
    expect(sb.map(c => c.key)).not.toContain('armor_class');
    expect(sb.find(c => c.key === 'hit_points')).toMatchObject({ current: 20, next: 33 });
    sb.find(c => c.key === 'content')!.apply = false;
    expect(patchFrom(changes, NPC_GROUP)).toEqual({ role: 'Half-Elf Rogue 5', description: sheet.npc.description, hooks_motivations: sheet.npc.hooks_motivations });
    expect(patchFrom(changes, STATBLOCK_GROUP)).not.toHaveProperty('content');
  });

  it('leaves a longer text the record already has unticked, so it isn’t replaced by default', () => {
    const changes = npcSheetChanges(sheet, { name: 'Mara Vell', description: 'Written by the DM.' }, { name: 'Mara Vell', content: 'Old actions' });
    expect(changes.find(c => c.key === 'description')?.apply).toBe(false);
    expect(changes.find(c => c.key === 'content')?.apply).toBe(false);
    expect(changes.find(c => c.key === 'role')?.apply).toBe(true);
    expect(changes.find(c => c.key === 'hooks_motivations')?.apply).toBe(true);
  });

  it('writes the whole stat sheet, keeping what isn’t changed', () => {
    const saved = mergedStatblock({ name: 'Old', challenge_rating: '2', dm_notes: 'Keep me', armor_class: 12 }, { armor_class: 15 }, 'Mara');
    expect(saved).toMatchObject({ name: 'Old', challenge_rating: '2', dm_notes: 'Keep me', armor_class: 15, skills: null });
    expect(mergedStatblock(null, { hit_points: 33 }, 'Mara')).toMatchObject({ name: 'Mara', hit_points: 33, creature_type: 'monstrosity' });
  });
});
