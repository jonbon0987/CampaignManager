// Levelling: the experience each level needs, and what a night's fights are
// worth. The thresholds are the same in the 2014 and 2024 rules.

import { CR_XP } from './encounterScaling';
import type { Fight } from './combat';
import type { MonsterStatblock } from './database.types';

/** Experience needed to reach each level: XP_FOR_LEVEL[level - 1]. */
export const XP_FOR_LEVEL = [
  0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000,
  85_000, 100_000, 120_000, 140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000,
] as const;

/** The level a character with this much experience has reached. */
export function levelForXp(xp: number): number {
  let level = 1;
  XP_FOR_LEVEL.forEach((need, i) => { if (xp >= need) level = i + 1; });
  return level;
}

/** Experience needed for the level after this one, or null at 20. */
export function nextLevelXp(level: number): number | null {
  return level >= 1 && level < 20 ? XP_FOR_LEVEL[level] : null;
}

/** "Enough for level 4", "450 XP to level 4", or nothing when there's no level to go by. */
export function xpProgress(xp: number | null | undefined, level: number | null | undefined): string | null {
  if (xp == null || !level) return null;
  const reached = levelForXp(xp);
  if (reached > level) return `Enough for level ${reached}`;
  const next = nextLevelXp(level);
  return next == null ? null : `${(next - xp).toLocaleString()} XP to level ${level + 1}`;
}

/** One kind of foe the party faced, with what it's worth. */
export interface FoeXp { name: string; count: number; xp: number | null }

/**
 * What the creatures in a fight are worth, grouped by kind ("Shattered
 * Vanguard ×3"). A creature without a stat sheet, or one whose sheet has no CR,
 * counts as unrated and adds nothing.
 */
export function fightXp(fight: Fight | null | undefined, statblocks: Pick<MonsterStatblock, 'id' | 'name' | 'challenge_rating'>[]): { foes: FoeXp[]; total: number } {
  const groups = new Map<string, FoeXp>();
  for (const c of fight?.combatants ?? []) {
    if (c.isPC) continue;
    const sb = c.statblockId ? statblocks.find(s => s.id === c.statblockId) : undefined;
    const each = sb ? CR_XP[String(sb.challenge_rating ?? '').trim()] ?? null : null;
    const name = sb?.name ?? c.name.replace(/ [A-Z]$/, '');
    const key = sb?.id ?? `name:${name}`;
    const g = groups.get(key) ?? { name, count: 0, xp: each === null ? null : 0 };
    g.count += 1;
    if (g.xp !== null && each !== null) g.xp += each;
    groups.set(key, g);
  }
  const foes = [...groups.values()];
  return { foes, total: foes.reduce((s, f) => s + (f.xp ?? 0), 0) };
}
