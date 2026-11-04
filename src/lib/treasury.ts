// The party's coin. Each ledger line adds to or takes from the stash; the
// balance is their sum. Coins stay as they were counted: nothing converts unless
// the DM says so, because 100 sp in a bag isn't the same as 10 gp at the table.
// Pure; ItemsContext saves the lines.

export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
export type Coin = (typeof COINS)[number];
export type Coins = Record<Coin, number>;

export const NO_COINS: Coins = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

const GP_VALUE: Coins = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 };
const MINUS = '−';

export const coinsOf = (c: Partial<Coins>): Coins => ({ pp: c.pp ?? 0, gp: c.gp ?? 0, ep: c.ep ?? 0, sp: c.sp ?? 0, cp: c.cp ?? 0 });

/** The balance of a list of lines. */
export function sumCoins(lines: Partial<Coins>[]): Coins {
  const out = { ...NO_COINS };
  for (const l of lines) for (const c of COINS) out[c] += l[c] ?? 0;
  return out;
}

export const hasCoins = (c: Partial<Coins>) => COINS.some(k => (c[k] ?? 0) !== 0);
export const negate = (c: Coins): Coins => ({ pp: -c.pp, gp: -c.gp, ep: -c.ep, sp: -c.sp, cp: -c.cp });

/** "120 gp, 5 sp", or empty for no coin at all. */
export function formatCoins(c: Partial<Coins>): string {
  return COINS.filter(k => (c[k] ?? 0) !== 0).map(k => `${(c[k]!).toLocaleString('en-US').replace('-', MINUS)} ${k}`).join(', ');
}

/** A ledger line: "+120 gp" or "−41 gp, −2 sp". */
export function formatLine(c: Partial<Coins>): string {
  return COINS.filter(k => (c[k] ?? 0) !== 0).map(k => `${c[k]! > 0 ? '+' : MINUS}${Math.abs(c[k]!).toLocaleString('en-US')} ${k}`).join(', ');
}

/** What it's all worth in gold, to the cent: 127.5. */
export function gpWorth(c: Partial<Coins>): number {
  return Math.round(COINS.reduce((sum, k) => sum + (c[k] ?? 0) * GP_VALUE[k], 0) * 100) / 100;
}

/**
 * Reads what a DM types: "120 gp, 5 sp", "5sp 2cp", "1,200 gp". A bare number is
 * gold. Null for anything else, or for nothing at all.
 */
export function parseCoins(text: string): Coins | null {
  const s = text.trim().toLowerCase().replace(/(\d),(\d{3})/g, '$1$2');
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s) > 0 ? { ...NO_COINS, gp: Number(s) } : null;
  const out = { ...NO_COINS };
  const rest = s.replace(/(\d+)\s*(pp|gp|ep|sp|cp)\b/g, (_, n: string, c: Coin) => { out[c] += Number(n); return ''; });
  return rest.replace(/[\s,;+&]|and/g, '') === '' && hasCoins(out) ? out : null;
}

/**
 * Sharing a balance evenly, coin by coin: what each of n people gets, and what
 * stays because it doesn't divide. Negative balances aren't shared out.
 */
export function splitEvenly(balance: Coins, n: number): { each: Coins; left: Coins } {
  const each = { ...NO_COINS };
  const left = { ...balance };
  if (n <= 0) return { each, left };
  for (const c of COINS) {
    if (balance[c] <= 0) continue;
    each[c] = Math.floor(balance[c] / n);
    left[c] = balance[c] - each[c] * n;
  }
  return { each, left };
}
