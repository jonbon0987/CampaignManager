import { describe, it, expect } from 'vitest';
import { formatCoins, formatLine, gpWorth, hasCoins, NO_COINS, parseCoins, splitEvenly, sumCoins } from './treasury';

describe('the treasury', () => {
  it('reads coin the way a DM types it', () => {
    expect(parseCoins('120 gp, 5 sp')).toEqual({ ...NO_COINS, gp: 120, sp: 5 });
    expect(parseCoins('5sp 2cp')).toEqual({ ...NO_COINS, sp: 5, cp: 2 });
    expect(parseCoins('1,200 gp')).toEqual({ ...NO_COINS, gp: 1200 });
    expect(parseCoins('3 PP and 2 ep')).toEqual({ ...NO_COINS, pp: 3, ep: 2 });
    expect(parseCoins('120')).toEqual({ ...NO_COINS, gp: 120 });
  });

  it('refuses what it can’t read, rather than guessing', () => {
    for (const bad of ['', '   ', 'lots', '12 dollars', '12 gp and a horse', '0', '0 gp']) expect(parseCoins(bad)).toBeNull();
  });

  it('adds up a ledger, spending included', () => {
    expect(sumCoins([{ gp: 120, sp: 5 }, { gp: -20 }, { cp: 3 }])).toEqual({ ...NO_COINS, gp: 100, sp: 5, cp: 3 });
    expect(sumCoins([])).toEqual(NO_COINS);
  });

  it('writes a balance and a line, largest coin first', () => {
    expect(formatCoins({ sp: 5, gp: 1200 })).toBe('1,200 gp, 5 sp');
    expect(formatCoins({ gp: -20 })).toBe('−20 gp');
    expect(formatCoins(NO_COINS)).toBe('');
    expect(formatLine({ gp: 120, sp: -5 })).toBe('+120 gp, −5 sp');
  });

  it('says what it’s worth in gold', () => {
    expect(gpWorth({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 5 })).toBe(12.85);
    expect(hasCoins(NO_COINS)).toBe(false);
  });

  it('splits coin by coin, leaving what doesn’t divide', () => {
    expect(splitEvenly({ ...NO_COINS, gp: 125, sp: 2 }, 3)).toEqual({
      each: { ...NO_COINS, gp: 41 },
      left: { ...NO_COINS, gp: 2, sp: 2 },
    });
  });

  it('won’t share out a debt, or split among no one', () => {
    expect(splitEvenly({ ...NO_COINS, gp: -30 }, 3).each).toEqual(NO_COINS);
    expect(splitEvenly({ ...NO_COINS, gp: 30 }, 0)).toEqual({ each: NO_COINS, left: { ...NO_COINS, gp: 30 } });
  });
});
