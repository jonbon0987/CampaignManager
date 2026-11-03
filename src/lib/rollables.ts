// The numbers in a stat block that can be rolled: an attack's "+5 to hit" (2024:
// "Attack Roll: +5"), its damage "10 (2d6 + 3)" or a bare "1d6", and a save or skill "Wis +3". The text
// is split into plain runs and those, so the stat sheet can show them as dice
// to click. Pure; the dice themselves are in lib/dice.

import { parseDice, type DiceSpec } from './dice';

export type Rollable =
  | { kind: 'attack'; mod: number }
  | { kind: 'damage'; spec: DiceSpec }
  | { kind: 'check'; mod: number; label: string };

export interface RollSegment { text: string; roll?: Rollable }

const DICE = String.raw`\d*d\d+(?:\s*[+-]\s*\d+)?`;
const PARTS = [
  String.raw`(?<atk>[+-]\d+)\s+to hit`,
  String.raw`(?<=Attack Roll:\s*)(?<atk24>[+-]\d+)`,
  String.raw`\d+\s*\((?<avg>${DICE})\)`,
  String.raw`\b(?<dice>${DICE})\b`,
];
// A save or skill bonus ("Wis +3", "Perception +3"), only where the text is a list of them.
const CHECK = String.raw`\b(?<chk>[A-Z][a-z]+) (?<chkmod>[+-]\d+)\b`;

/**
 * Splits text into plain runs and rollable ones. `checks` also picks up
 * "Name +N" bonuses, for the saving throws and skills lines.
 */
export function rollSegments(text: string, { checks = false }: { checks?: boolean } = {}): RollSegment[] {
  const re = new RegExp([...PARTS, ...(checks ? [CHECK] : [])].join('|'), 'gi');
  const out: RollSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const g = m.groups ?? {};
    let roll: Rollable | null = null;
    if (g.atk || g.atk24) roll = { kind: 'attack', mod: parseInt(g.atk ?? g.atk24, 10) };
    else if (g.avg || g.dice) {
      const spec = parseDice(g.avg ?? g.dice);
      if (spec) roll = { kind: 'damage', spec };
    } else if (g.chk && /^[A-Z]/.test(g.chk)) roll = { kind: 'check', mod: parseInt(g.chkmod, 10), label: g.chk };
    if (!roll) continue;
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[0], roll });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** True when text holds anything rollable. */
export const hasRollables = (text: string, opts?: { checks?: boolean }) => rollSegments(text, opts).some(s => s.roll);
