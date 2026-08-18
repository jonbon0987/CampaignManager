import { describe, it, expect } from 'vitest';
import { parsedToMonsterForm, mergeMissing, buildCompletionPrompt } from './statblockCompletion';
import { emptyMonsterForm, type MonsterForm } from '../components/tabs/CreatureStatblocks';

describe('parsedToMonsterForm', () => {
  it('maps a full JSON object into a form (numbers → strings)', () => {
    const f = parsedToMonsterForm({ name: 'Wolf', challenge_rating: '1/4', armor_class: 13, hit_points: 11, str: 12 });
    expect(f.name).toBe('Wolf');
    expect(f.challenge_rating).toBe('1/4');
    expect(f.armor_class).toBe('13');
    expect(f.hit_points).toBe('11');
    expect(f.str).toBe('12');
  });
  it('leaves absent fields blank and defaults creature_type', () => {
    const f = parsedToMonsterForm({ name: 'X' });
    expect(f.armor_class).toBe('');
    expect(f.senses).toBe('');
    expect(f.creature_type).toBe('monstrosity');
  });
});

describe('mergeMissing', () => {
  it('keeps existing values and only fills blanks', () => {
    const current: MonsterForm = { ...emptyMonsterForm(), name: 'Cave Troll', challenge_rating: '5', armor_class: '15' };
    const generated: MonsterForm = { ...emptyMonsterForm(), name: 'Generated Name', challenge_rating: '3', armor_class: '99', hit_points: '84', speed: '30 ft.' };
    const merged = mergeMissing(current, generated);
    // provided fields preserved
    expect(merged.name).toBe('Cave Troll');
    expect(merged.challenge_rating).toBe('5');
    expect(merged.armor_class).toBe('15');
    // blank fields filled from generated
    expect(merged.hit_points).toBe('84');
    expect(merged.speed).toBe('30 ft.');
  });
  it('never overwrites creature_type', () => {
    const current: MonsterForm = { ...emptyMonsterForm(), creature_type: 'dragon' };
    const generated: MonsterForm = { ...emptyMonsterForm(), creature_type: 'ooze' };
    expect(mergeMissing(current, generated).creature_type).toBe('dragon');
  });
  it('ignores whitespace-only current values', () => {
    const current: MonsterForm = { ...emptyMonsterForm(), speed: '   ' };
    const generated: MonsterForm = { ...emptyMonsterForm(), speed: '40 ft.' };
    expect(mergeMissing(current, generated).speed).toBe('40 ft.');
  });
});

describe('buildCompletionPrompt', () => {
  it('lists provided fields to preserve and requests JSON', () => {
    const form: MonsterForm = { ...emptyMonsterForm(), name: 'Shadow Drake', challenge_rating: '4', hit_points: '52' };
    const p = buildCompletionPrompt(form);
    expect(p).toContain('KEEP these EXACTLY');
    expect(p).toContain('- Name: Shadow Drake');
    expect(p).toContain('- Challenge rating: 4');
    expect(p).toContain('- Hit points: 52');
    expect(p).toContain('"hit_dice"'); // JSON spec present
    // empty fields are not listed as provided
    expect(p).not.toContain('- Speed:');
  });
  it('handles an entirely blank form', () => {
    const p = buildCompletionPrompt(emptyMonsterForm());
    // creature_type defaults to monstrosity, so it is the one provided line
    expect(p).toContain('- Creature type: monstrosity');
    expect(p).toContain('Respond with a single JSON object');
  });
  it('requires the content/actions block when content is empty', () => {
    const p = buildCompletionPrompt({ ...emptyMonsterForm(), name: 'X' });
    expect(p).toContain('"content" field is REQUIRED');
    expect(p).toContain('Actions');
  });
  it('does not demand content when it is already provided', () => {
    const p = buildCompletionPrompt({ ...emptyMonsterForm(), content: 'Multiattack. The creature makes two attacks.' });
    expect(p).not.toContain('"content" field is REQUIRED');
  });
});
