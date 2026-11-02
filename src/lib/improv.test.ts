import { describe, it, expect } from 'vitest';
import { CULTURES, makeName, npcIdeaText, quickNpc, ROLES, TRAITS, VOICES, type CultureKey } from './improv';

/** A fixed sequence of "random" numbers, so results repeat. */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('makeName', () => {
  it('builds a capitalised name for every culture', () => {
    for (const k of Object.keys(CULTURES) as CultureKey[]) {
      for (let i = 0; i < 20; i++) {
        const name = makeName(k);
        expect(name).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/);
      }
    }
  });

  it('adds a family name where the culture has them, and not where it doesn’t', () => {
    expect(makeName('human', seq(0)).split(' ')).toHaveLength(2);
    expect(makeName('orc', seq(0)).split(' ')).toHaveLength(1);
  });

  it('is repeatable with the same rolls', () => {
    expect(makeName('elf', seq(0.1, 0.9, 0.3, 0.5, 0.7))).toBe(makeName('elf', seq(0.1, 0.9, 0.3, 0.5, 0.7)));
  });
});

describe('quickNpc', () => {
  it('gives a name, a role, a voice and one trait from the lists', () => {
    const npc = quickNpc('dwarf', seq(0.5));
    expect(npc.name).toBeTruthy();
    expect(ROLES).toContain(npc.role);
    expect(VOICES).toContain(npc.voice);
    expect(TRAITS).toContain(npc.trait);
  });

  it('reads as one line for the Inbox', () => {
    expect(npcIdeaText({ name: 'Brom Ironfist', role: 'smith', voice: 'gruff', trait: 'collects buttons' }))
      .toBe('Brom Ironfist, smith. Voice: gruff. Trait: collects buttons.');
  });
});
