import { describe, it, expect } from 'vitest';
import { rollSegments } from './rollables';
import { critical, d20Natural, parseDice, rollD20 } from './dice';

describe('rollables', () => {
  it('finds an attack, its damage and a bare die in action text', () => {
    const segs = rollSegments('Greatsword. Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 10 (2d6 + 3) slashing, or 1d4 more.');
    const rolls = segs.filter(s => s.roll);
    expect(rolls.map(s => s.text)).toEqual(['+5 to hit', '10 (2d6 + 3)', '1d4']);
    expect(rolls[0].roll).toEqual({ kind: 'attack', mod: 5 });
    expect(rolls[1].roll).toMatchObject({ kind: 'damage', spec: { count: 2, sides: 6, mod: 3 } });
    expect(segs.map(s => s.text).join('')).toBe('Greatsword. Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 10 (2d6 + 3) slashing, or 1d4 more.');
  });

  it('reads the 2024 "Attack Roll: +N" wording, leaving the words as text', () => {
    const text = 'Scimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.';
    const rolls = rollSegments(text).filter(s => s.roll);
    expect(rolls.map(s => s.text)).toEqual(['+4', '5 (1d6 + 2)']);
    expect(rolls[0].roll).toEqual({ kind: 'attack', mod: 4 });
    expect(rollSegments(text).map(s => s.text).join('')).toBe(text);
  });

  it('reads saves and skills only when asked', () => {
    expect(rollSegments('Wis +3, Perception +3').some(s => s.roll)).toBe(false);
    const segs = rollSegments('Wis +3, Perception -1', { checks: true }).filter(s => s.roll);
    expect(segs.map(s => s.roll)).toEqual([{ kind: 'check', mod: 3, label: 'Wis' }, { kind: 'check', mod: -1, label: 'Perception' }]);
  });

  it('leaves text with nothing to roll as one run', () => {
    expect(rollSegments('Resistant to cold.')).toEqual([{ text: 'Resistant to cold.' }]);
  });
});

describe('d20 rolls', () => {
  const seq = (...values: number[]) => { let i = 0; return () => (values[i++] - 1) / 20; };

  it('keeps the higher die with advantage and the lower with disadvantage', () => {
    expect(rollD20(5, 'advantage', seq(4, 17))).toMatchObject({ rolls: [4, 17], total: 22, expr: '1d20+5 adv' });
    expect(rollD20(5, 'disadvantage', seq(4, 17))).toMatchObject({ total: 9, expr: '1d20+5 dis' });
    expect(rollD20(-1, 'normal', seq(10))).toMatchObject({ rolls: [10], total: 9, expr: '1d20-1' });
  });

  it('spots a natural 20 or 1 on the die that was kept', () => {
    expect(d20Natural(rollD20(0, 'advantage', seq(1, 20)))).toBe('crit');
    expect(d20Natural(rollD20(0, 'disadvantage', seq(1, 20)))).toBe('fumble');
    expect(d20Natural({ expr: '2d6', rolls: [6, 6] })).toBeNull();
  });

  it('doubles the dice on a critical hit, not the modifier', () => {
    expect(critical(parseDice('2d6+3')!)).toMatchObject({ count: 4, sides: 6, mod: 3, expr: '4d6+3 crit' });
  });
});
