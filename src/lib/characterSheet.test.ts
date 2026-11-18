// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  fromFormFields, parseClassLevel, parseNumber, matchPC, sheetChanges, patchFrom, cleanSheetValues, readEnough,
} from './characterSheet';
import { readPdf } from './readCharacterSheet';

// Field names as the official WotC 5e fillable sheet spells them (note the stray spaces).
const OFFICIAL = {
  CharacterName: 'Ayla Thornwood', PlayerName: 'Sam', 'Race ': 'Wood Elf', ClassLevel: 'Ranger 3 / Rogue 2',
  Background: 'Outlander', XP: '6,500', AC: '15', HPMax: '38', Passive: '16',
  'PersonalityTraits ': 'I watch over my friends.', Ideals: 'Freedom.', Bonds: 'My sister.', Flaws: 'Too trusting.',
  'SpellSaveDC  2': '13', Initiative: '+4', STR: '10',
};

describe('fromFormFields', () => {
  it('reads the official sheet’s fields', () => {
    expect(fromFormFields(OFFICIAL)).toEqual({
      character_name: 'Ayla Thornwood', player_name: 'Sam', race: 'Wood Elf',
      class: 'Ranger 3 / Rogue 2', level: 5, background: 'Outlander', xp: 6500,
      armor_class: 15, max_hp: 38, passive_perception: 16, spell_save_dc: 13,
      story_hooks: '**Personality.** I watch over my friends.\n\n**Ideals.** Freedom.\n\n**Bonds.** My sister.\n\n**Flaws.** Too trusting.',
    });
  });

  it('reads D&D Beyond’s export fields', () => {
    // As its "Export to PDF" names them (page 1, the spell page, page 4's story boxes).
    expect(fromFormFields({
      CharacterName: 'Bram Ironside', 'CLASS  LEVEL': 'Cleric 5', 'PLAYER NAME': 'Alex', RACE: 'Hill Dwarf', BACKGROUND: 'Acolyte',
      'EXPERIENCE POINTS': '(Milestone)', AC: '18', MaxHP: '43', Passive1: '15', Passive2: '13', Passive3: '10',
      spellSaveDC0: '14', 'PersonalityTraits ': 'Stubborn.', Ideals: '', Bonds: 'My temple.', 'Wpn Name': 'Mace', CharacterName2: 'Bram Ironside',
    })).toEqual({
      character_name: 'Bram Ironside', class: 'Cleric', level: 5, player_name: 'Alex', race: 'Hill Dwarf', background: 'Acolyte',
      armor_class: 18, max_hp: 43, passive_perception: 15, passive_insight: 13, passive_investigation: 10, spell_save_dc: 14,
      story_hooks: '**Personality.** Stubborn.\n\n**Bonds.** My temple.',
    });
  });

  it('matches names whatever their case and spacing, and takes separate class and level boxes', () => {
    expect(fromFormFields({ 'CHARACTER NAME': 'Bram', 'CLASS': 'Cleric', 'LEVEL': '4', 'Max HP': '31', 'Armor Class': '18',
      'Passive Perception': '13', 'Passive Insight': '15', 'Passive Investigation': '10' })).toEqual({
      character_name: 'Bram', class: 'Cleric', level: 4, max_hp: 31, armor_class: 18,
      passive_perception: 13, passive_insight: 15, passive_investigation: 10,
    });
  });

  it('ignores blanks and unknown fields, and needs a name and one more value to count as read', () => {
    expect(fromFormFields({ Foo: 'x', CharacterName: '  ', AC: '' })).toEqual({});
    expect(readEnough(fromFormFields({ CharacterName: 'Bram' }))).toBe(false);
    expect(readEnough(fromFormFields({ CharacterName: 'Bram', AC: '12' }))).toBe(true);
  });
});

describe('parsing values', () => {
  it('reads class and level in the shapes sheets use', () => {
    expect(parseClassLevel('Fighter 3')).toEqual({ class: 'Fighter', level: 3 });
    expect(parseClassLevel('Fighter 3 (Battle Master)')).toEqual({ class: 'Fighter (Battle Master)', level: 3 });
    expect(parseClassLevel('Wizard (Evocation) 5')).toEqual({ class: 'Wizard (Evocation)', level: 5 });
    expect(parseClassLevel('Fighter 3, Rogue 2')).toEqual({ class: 'Fighter 3 / Rogue 2', level: 5 });
    expect(parseClassLevel('3 Fighter')).toEqual({ class: 'Fighter', level: 3 });
    expect(parseClassLevel('Bard')).toEqual({ class: 'Bard', level: null });
  });

  it('takes the first number', () => {
    expect(parseNumber('+2')).toBe(2);
    expect(parseNumber('24 / 24')).toBe(24);
    expect(parseNumber('1,250 XP')).toBe(1250);
    expect(parseNumber('—')).toBeNull();
  });

  it('cleans what the AI returns', () => {
    expect(cleanSheetValues({ character_name: ' Bram ', level: '4', max_hp: 31.4, ac: 12, armor_class: null, race: '' }))
      .toEqual({ character_name: 'Bram', level: 4, max_hp: 31 });
    expect(cleanSheetValues('nope')).toEqual({});
  });
});

describe('matching and reviewing', () => {
  const pcs = [{ id: 'p1', character_name: 'Ayla  Thornwood' }, { id: 'p2', character_name: 'Bram' }];

  it('finds the PC a sheet is for by name', () => {
    expect(matchPC({ character_name: 'ayla thornwood' }, pcs)?.id).toBe('p1');
    expect(matchPC({ character_name: 'Cass' }, pcs)).toBeNull();
    expect(matchPC({}, pcs)).toBeNull();
  });

  it('lists only what would change, ticked, and patches what stays ticked', () => {
    const changes = sheetChanges({ character_name: 'Bram', level: 5, armor_class: 18, race: 'Dwarf' }, { character_name: 'Bram', level: 4, armor_class: null, race: 'Dwarf' });
    expect(changes.map(c => [c.key, c.current, c.next, c.apply])).toEqual([['level', 4, 5, true], ['armor_class', null, 18, true]]);
    changes[0].apply = false;
    expect(patchFrom(changes)).toEqual({ armor_class: 18 });
  });
});

describe('readPdf', () => {
  it('reads the form fields of a fillable PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Character sheet', { x: 20, y: 370, size: 12, font });
    const form = doc.getForm();
    Object.entries(OFFICIAL).forEach(([name, value], i) => {
      const f = form.createTextField(name);
      f.setText(value);
      f.addToPage(page, { x: 20, y: 330 - i * 20, width: 200, height: 16 });
    });
    const { fields, text } = await readPdf(new Uint8Array(await doc.save()));
    expect(fields['Race ']).toBe('Wood Elf');
    expect(fromFormFields(fields)).toMatchObject({ character_name: 'Ayla Thornwood', level: 5, max_hp: 38 });
    expect(text).toContain('Character sheet');
  });

  it('gives no fields for a flattened sheet, only its text', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Bram   Cleric 4   Armor Class 18', { x: 20, y: 370, size: 12, font });
    const { fields, text } = await readPdf(new Uint8Array(await doc.save()));
    expect(fields).toEqual({});
    expect(text).toContain('Armor Class 18');
  });
});
