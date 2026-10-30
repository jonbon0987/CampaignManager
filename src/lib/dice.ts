// Dice notation: "d20", "2d6+3", "roll 4d8 - 2". Shared by the ⌘K palette
// and Play's dice tray, so both read and show a roll the same way.

const DICE = /^(?:roll\s+)?(\d*)d(\d+)\s*([+-]\s*\d+)?$/i;

export interface DiceSpec { count: number; sides: number; mod: number; expr: string }
export interface DiceRoll extends DiceSpec { rolls: number[]; total: number }

/** Reads dice notation, or null when the text isn't a roll. Counts cap at 100. */
export function parseDice(text: string): DiceSpec | null {
  const m = text.trim().match(DICE);
  if (!m) return null;
  const count = Math.min(parseInt(m[1] || '1', 10), 100);
  const sides = parseInt(m[2], 10);
  if (!(count > 0) || !(sides > 0)) return null;
  const mod = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
  return { count, sides, mod, expr: `${count}d${sides}${mod > 0 ? `+${mod}` : mod < 0 ? mod : ''}` };
}

export function roll(spec: DiceSpec, random: () => number = Math.random): DiceRoll {
  const rolls = Array.from({ length: spec.count }, () => Math.floor(random() * spec.sides) + 1);
  return { ...spec, rolls, total: rolls.reduce((a, b) => a + b, 0) + spec.mod };
}

/** "2d6+3 → 11   [4, 4] +3", or "1d20 → 17" for a single plain die. */
export function describeRoll(r: Pick<DiceRoll, 'expr' | 'total' | 'rolls'> & { mod?: number }): string {
  const mod = r.mod ?? 0;
  const detail = r.rolls.length > 1 || mod ? `   [${r.rolls.join(', ')}]${mod ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}` : '';
  return `${r.expr} → ${r.total}${detail}`;
}

/** A natural 20 or 1 on a single d20. */
export function d20Natural(r: Pick<DiceRoll, 'rolls'> & { expr: string }): 'crit' | 'fumble' | null {
  if (r.rolls.length !== 1 || !/^1d20\b/.test(r.expr)) return null;
  return r.rolls[0] === 20 ? 'crit' : r.rolls[0] === 1 ? 'fumble' : null;
}
