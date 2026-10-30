// The rules of a fight: turn order, hit points, death saves and conditions.
// Plain data and pure functions, so a fight can be saved on the session and
// run by both the full-screen tracker (Encounters) and the docked one (Play).

import type { Encounter, EncounterCombatant, MonsterStatblock, PlayerCharacter } from './database.types';

// ─── D&D 5e conditions ───────────────────────────────────────────────────────
export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'concentrating',
] as const;
// Death-state conditions ('dying' | 'stable' | 'dead') are managed by the HP
// rules below (not offered in a condition picker), but still show as pills and
// can be undone.
export type Condition = (typeof CONDITIONS)[number] | 'dying' | 'stable' | 'dead';

export const CONDITION_COLORS: Record<string, string> = {
  blinded: 'var(--ink-3)', charmed: 'var(--arcane)', deafened: 'var(--ink-3)',
  frightened: 'var(--gold)', grappled: 'var(--cr)', incapacitated: 'var(--ink-3)',
  invisible: 'var(--info)', paralyzed: 'var(--red)', petrified: 'var(--ink-3)',
  poisoned: 'var(--success)', prone: 'var(--accent)', restrained: 'var(--cr)',
  stunned: 'var(--diff-hard)', unconscious: 'var(--red)', concentrating: 'var(--info)',
  dying: 'var(--red)', stable: 'var(--moss)', dead: 'var(--ink-3)',
};

const DEATH_STATE: readonly Condition[] = ['unconscious', 'dying', 'stable', 'dead'];

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DeathSaves {
  s: number; // successes (0–3)
  f: number; // failures (0–3)
}

export interface Combatant {
  id: string;
  name: string;
  initiative: number | null;
  dexMod: number;
  maxHp: number;
  currentHp: number;
  temp: number;
  deathSaves: DeathSaves;
  ac: number | null;
  conditions: Condition[];
  isPC: boolean;
  statblockId: string | null;
  notes: string | null;
  /** The encounter this combatant came in with, if any. */
  encounterId?: string | null;
}

export interface Fight {
  combatants: Combatant[];
  /** Index into the turn order; -1 until the fight starts. */
  turn: number;
  round: number;
}

export const EMPTY_FIGHT: Fight = { combatants: [], turn: -1, round: 1 };

/** A player character joining the fight, with what the Cast tab knows of them. */
export interface PartyMember {
  name: string;
  maxHp: number | null;
  ac: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function abilityMod(score: number | null): number {
  if (score == null) return 0;
  return Math.floor((score - 10) / 2);
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Clamp to [0, max] when a max is known, else just floor at 0 (a PC whose max
// HP isn't set is tracked as a running current-HP counter).
const clampHp = (hp: number, maxHp: number) => (maxHp > 0 ? clamp(hp, 0, maxHp) : Math.max(0, hp));

const without = (conditions: Condition[], drop: readonly Condition[]) => conditions.filter(c => !drop.includes(c));

function parseCombatants(raw: string | null): EncounterCombatant[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as EncounterCombatant[]; }
  catch { return []; }
}

const base = (over: Partial<Combatant> & Pick<Combatant, 'name'>): Combatant => ({
  id: crypto.randomUUID(),
  initiative: null,
  dexMod: 0,
  maxHp: 10,
  currentHp: 10,
  temp: 0,
  deathSaves: { s: 0, f: 0 },
  ac: null,
  conditions: [],
  isPC: false,
  statblockId: null,
  notes: null,
  ...over,
});

// ─── Who's in the fight ──────────────────────────────────────────────────────

/** An encounter's creatures, one combatant each ("Goblin A", "Goblin B"…). */
export function combatantsFromEncounter(encounter: Pick<Encounter, 'id' | 'combatants'>, statblocks: MonsterStatblock[]): Combatant[] {
  return parseCombatants(encounter.combatants).flatMap(ec => {
    const sb = ec.statblock_id ? statblocks.find(m => m.id === ec.statblock_id) : undefined;
    const maxHp = sb?.hit_points ?? 10;
    return Array.from({ length: ec.count }, (_, i) => base({
      name: `${ec.name}${ec.count > 1 ? ` ${String.fromCharCode(65 + i)}` : ''}`,
      dexMod: sb ? abilityMod(sb.dex) : 0,
      maxHp,
      currentHp: maxHp,
      ac: sb?.armor_class ?? null,
      statblockId: sb?.id ?? null,
      notes: ec.notes,
      encounterId: encounter.id,
    }));
  });
}

/** The party. A PC without Max HP in Cast starts at 0, which reads as "not set", not "down". */
export function combatantsFromParty(party: PartyMember[]): Combatant[] {
  return party.map(pc => base({ name: pc.name, maxHp: pc.maxHp ?? 0, currentHp: pc.maxHp ?? 0, ac: pc.ac, isPC: true }));
}

/** The campaign's active player characters, as the fight sees them. */
export function partyFrom(pcs: Pick<PlayerCharacter, 'is_active' | 'character_name' | 'max_hp' | 'armor_class'>[]): PartyMember[] {
  return pcs.filter(p => p.is_active && p.character_name).map(p => ({ name: p.character_name, maxHp: p.max_hp, ac: p.armor_class }));
}

/** Someone added by hand mid-fight. */
export function newCombatant(name: string): Combatant {
  return base({ name });
}

// ─── Turn order ──────────────────────────────────────────────────────────────

/** Highest initiative first; ties go to the higher Dex. Not yet rolled goes last. */
export function turnOrder(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    const ai = a.initiative ?? -999;
    const bi = b.initiative ?? -999;
    if (bi !== ai) return bi - ai;
    return b.dexMod - a.dexMod;
  });
}

export const isStarted = (f: Fight) => f.turn >= 0;

/** Whose turn it is, once the fight has started. */
export function currentCombatant(f: Fight): Combatant | null {
  return isStarted(f) ? turnOrder(f.combatants)[f.turn] ?? null : null;
}

export const startFight = (f: Fight): Fight => ({ ...f, turn: 0, round: 1 });
export const resetFight = (f: Fight): Fight => ({ ...f, turn: -1, round: 1 });

export function nextTurn(f: Fight): Fight {
  if (!isStarted(f) || f.combatants.length === 0) return f;
  const next = f.turn + 1;
  return next >= f.combatants.length ? { ...f, turn: 0, round: f.round + 1 } : { ...f, turn: next };
}

export function rollInitiatives(f: Fight, who: 'all' | 'npcs'): Fight {
  return {
    ...f,
    combatants: f.combatants.map(c => (who === 'npcs' && c.isPC ? c : { ...c, initiative: rollD20() + c.dexMod })),
  };
}

/** Keeps the same combatant's turn when the order changes underneath it. */
function keepTurn(before: Fight, combatants: Combatant[]): Fight {
  const cur = currentCombatant(before);
  if (!cur) return { ...before, combatants };
  const idx = turnOrder(combatants).findIndex(c => c.id === cur.id);
  return { ...before, combatants, turn: idx >= 0 ? idx : before.turn };
}

export function setInitiative(f: Fight, id: string, value: number | null): Fight {
  return keepTurn(f, f.combatants.map(c => (c.id === id ? { ...c, initiative: value } : c)));
}

/** Joins combatants to the fight. Once it has started, newcomers roll initiative as they join. */
export function addCombatants(f: Fight, list: Combatant[]): Fight {
  const joined = isStarted(f) ? list.map(c => (c.initiative == null ? { ...c, initiative: rollD20() + c.dexMod } : c)) : list;
  return keepTurn(f, [...f.combatants, ...joined]);
}

export function removeCombatant(f: Fight, id: string): Fight {
  const combatants = f.combatants.filter(c => c.id !== id);
  if (!isStarted(f)) return { ...f, combatants };
  const idx = turnOrder(f.combatants).findIndex(c => c.id === id);
  if (idx < 0) return f;
  if (combatants.length === 0) return { ...f, combatants, turn: -1, round: 1 };
  if (idx < f.turn) return { ...f, combatants, turn: f.turn - 1 };
  // Removing whoever's turn it is hands it to the next in line.
  if (idx === f.turn && f.turn >= combatants.length) return { ...f, combatants, turn: 0, round: f.round + 1 };
  return { ...f, combatants };
}

export function updateCombatant(f: Fight, id: string, change: (c: Combatant) => Combatant): Fight {
  return { ...f, combatants: f.combatants.map(c => (c.id === id ? change(c) : c)) };
}

// ─── Hit points and death ────────────────────────────────────────────────────
// Each returns the combatant unchanged (the same object) when there's nothing
// to do, so callers can tell a real change from a no-op.

export function damage(c: Combatant, n: number): Combatant {
  if (!(n > 0)) return c;
  let dmg = n;
  let temp = c.temp;
  if (temp > 0) { const absorbed = Math.min(temp, dmg); temp -= absorbed; dmg -= absorbed; }
  const currentHp = clampHp(c.currentHp - dmg, c.maxHp);
  let conditions = without(c.conditions, DEATH_STATE);
  let deathSaves = c.deathSaves;
  // Only a combatant with a known max can be "down"; this keeps a PC whose HP
  // isn't entered yet (0/0) from triggering death saves.
  if (currentHp === 0 && c.maxHp > 0) {
    if (c.isPC) { conditions = [...conditions, 'dying']; deathSaves = { s: 0, f: 0 }; }
    else conditions = [...conditions, 'unconscious'];
  } else if (currentHp === 0 && !c.isPC) {
    conditions = [...conditions, 'unconscious'];
  }
  return { ...c, currentHp, temp, conditions, deathSaves };
}

export function heal(c: Combatant, n: number): Combatant {
  if (!(n > 0)) return c;
  // From 0, healing revives to exactly n; otherwise it adds on.
  const raw = c.currentHp <= 0 ? n : c.currentHp + n;
  return { ...c, currentHp: clampHp(raw, c.maxHp), conditions: without(c.conditions, DEATH_STATE), deathSaves: { s: 0, f: 0 } };
}

/** Temp HP doesn't stack (5e): a new source keeps the higher value. */
export function addTemp(c: Combatant, n: number): Combatant {
  if (!(n > 0)) return c;
  return { ...c, temp: Math.max(c.temp, n) };
}

/** Sets current HP exactly, with the same death rules as damage and healing. */
export function setCurrentHp(c: Combatant, value: number): Combatant {
  if (!(value >= 0)) return c;
  const currentHp = clampHp(value, c.maxHp);
  let conditions = without(c.conditions, DEATH_STATE);
  let deathSaves = c.deathSaves;
  if (currentHp <= 0 && c.maxHp > 0) {
    if (c.isPC) { conditions = [...conditions, 'dying']; deathSaves = { s: 0, f: 0 }; }
    else conditions = [...conditions, 'unconscious'];
  } else {
    deathSaves = { s: 0, f: 0 };
  }
  return { ...c, currentHp, conditions, deathSaves };
}

/**
 * Overrides max HP for this fight (a buffed boss, or a PC whose HP wasn't set).
 * Current HP is re-clamped; setting a max for the first time fills it.
 */
export function setMaxHp(c: Combatant, value: number): Combatant {
  if (!(value >= 0)) return c;
  const maxHp = Math.max(0, Math.floor(value));
  let currentHp = c.currentHp;
  if (maxHp > 0 && c.maxHp === 0 && c.currentHp === 0) currentHp = maxHp;
  else if (maxHp > 0) currentHp = Math.min(c.currentHp, maxHp);
  return { ...c, maxHp, currentHp };
}

export function setDeathSave(c: Combatant, key: 's' | 'f', val: number): Combatant {
  const deathSaves: DeathSaves = { ...c.deathSaves, [key]: val };
  let conditions = without(c.conditions, ['dying', 'stable', 'dead']);
  if (deathSaves.f >= 3) conditions = [...conditions, 'dead'];
  else if (deathSaves.s >= 3) { conditions = [...conditions, 'stable']; deathSaves.s = 3; deathSaves.f = 0; }
  else conditions = [...conditions, 'dying'];
  return { ...c, deathSaves, conditions };
}

export function toggleCondition(c: Combatant, condition: Condition): Combatant {
  return c.conditions.includes(condition)
    ? { ...c, conditions: c.conditions.filter(x => x !== condition) }
    : { ...c, conditions: [...c.conditions, condition] };
}

/** True when a combatant has a max HP and has dropped to 0. */
export const isDown = (c: Combatant) => c.maxHp > 0 && c.currentHp <= 0;
