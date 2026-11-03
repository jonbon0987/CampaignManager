import { describe, it, expect } from 'vitest';
import { fightXp, levelForXp, nextLevelXp, xpProgress } from './levelling';
import { fightSummary, newCombatant, type Combatant, type Fight } from './combat';

const foe = (name: string, over: Partial<Combatant> = {}): Combatant => ({ ...newCombatant(name), maxHp: 52, currentHp: 52, ...over });
const fight = (combatants: Combatant[], over: Partial<Fight> = {}): Fight => ({ combatants, turn: 0, round: 2, ...over });
const sheets = [
  { id: 'vg', name: 'Shattered Vanguard', challenge_rating: '2' },
  { id: 'gob', name: 'Goblin', challenge_rating: '1/4' },
  { id: 'odd', name: 'Thing', challenge_rating: null },
];

describe('levels', () => {
  it('reads the level an XP total reaches', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(899)).toBe(2);
    expect(levelForXp(900)).toBe(3);
    expect(levelForXp(400_000)).toBe(20);
    expect(nextLevelXp(3)).toBe(2_700);
    expect(nextLevelXp(20)).toBeNull();
  });

  it('says how far the next level is, or that it’s reached', () => {
    expect(xpProgress(2_250, 3)).toBe('450 XP to level 4');
    expect(xpProgress(3_000, 3)).toBe('Enough for level 4');
    expect(xpProgress(null, 3)).toBeNull();
    expect(xpProgress(100, null)).toBeNull();
  });
});

describe('fight xp', () => {
  it('groups the foes by kind and adds up their CR', () => {
    const f = fight([
      foe('Shattered Vanguard A', { statblockId: 'vg' }),
      foe('Shattered Vanguard B', { statblockId: 'vg' }),
      foe('Goblin', { statblockId: 'gob' }),
      { ...foe('Test Hero'), isPC: true },
    ]);
    const { foes, total } = fightXp(f, sheets);
    expect(foes).toEqual([
      { name: 'Shattered Vanguard', count: 2, xp: 900 },
      { name: 'Goblin', count: 1, xp: 50 },
    ]);
    expect(total).toBe(950);
  });

  it('counts a creature with no CR as unrated', () => {
    const { foes, total } = fightXp(fight([foe('Bandit'), foe('Thing', { statblockId: 'odd' })]), sheets);
    expect(foes.every(f => f.xp === null)).toBe(true);
    expect(total).toBe(0);
  });
});

describe('fight summary', () => {
  it('says nothing about a fight that never started', () => {
    expect(fightSummary(fight([foe('Goblin')], { turn: -1 }))).toBeNull();
    expect(fightSummary(null)).toBeNull();
  });

  it('names the foes, who fell, and any PC at 0 HP', () => {
    const f = fight([
      foe('Shattered Vanguard A', { currentHp: 0 }),
      foe('Shattered Vanguard B'),
      { ...foe('Test Hero', { maxHp: 24, currentHp: 0 }), isPC: true },
    ]);
    expect(fightSummary(f)).toBe('2 rounds against Shattered Vanguard ×2. Down: Shattered Vanguard A. At 0 HP: Test Hero.');
    expect(fightSummary(fight([foe('Goblin', { currentHp: 0 })], { round: 1 }))).toBe('1 round against Goblin. All of them fell.');
  });
});
