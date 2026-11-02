import { describe, it, expect } from 'vitest';
import {
  addCombatants, addTemp, combatantsFromEncounter, combatantsFromParty, currentCombatant, damage, heal,
  newCombatant, nextTurn, removeCombatant, setCurrentHp, setDeathSave, setInitiative, setMaxHp,
  startFight, toggleCondition, turnOrder, type Combatant, type Fight,
  CONDITIONS, CONDITION_RULES, concentrationDC, resolveConcentration, setConditionRounds,
} from './combat';
import type { MonsterStatblock } from './database.types';

const c = (name: string, over: Partial<Combatant> = {}): Combatant => ({ ...newCombatant(name), id: name, ...over });
const fight = (combatants: Combatant[], turn = -1, round = 1): Fight => ({ combatants, turn, round });
const names = (f: Fight) => turnOrder(f.combatants).map(x => x.name);

describe('who joins a fight', () => {
  it('splits an encounter into lettered creatures with their stat sheet numbers', () => {
    const sb = { id: 'sb1', hit_points: 22, armor_class: 15, dex: 14 } as MonsterStatblock;
    const list = combatantsFromEncounter(
      { id: 'e1', combatants: JSON.stringify([{ name: 'Goblin', count: 2, statblock_id: 'sb1', notes: null }, { name: 'Boss', count: 1, statblock_id: null, notes: 'Flees at half' }]) },
      [sb],
    );
    expect(list.map(x => x.name)).toEqual(['Goblin A', 'Goblin B', 'Boss']);
    expect(list[0]).toMatchObject({ maxHp: 22, currentHp: 22, ac: 15, dexMod: 2, statblockId: 'sb1', encounterId: 'e1', isPC: false });
    expect(list[2]).toMatchObject({ maxHp: 10, ac: null, notes: 'Flees at half' });
  });

  it('reads a broken encounter as empty', () => {
    expect(combatantsFromEncounter({ id: 'e', combatants: '{oops' }, [])).toEqual([]);
  });

  it('brings the party in with HP and AC from Cast, unset HP as 0', () => {
    const [a, b] = combatantsFromParty([{ name: 'Sam', maxHp: 24, ac: 15 }, { name: 'Ash', maxHp: null, ac: null }]);
    expect(a).toMatchObject({ name: 'Sam', isPC: true, maxHp: 24, currentHp: 24, ac: 15 });
    expect(b).toMatchObject({ maxHp: 0, currentHp: 0 });
  });
});

describe('turn order', () => {
  const f = fight([c('Low', { initiative: 5 }), c('High', { initiative: 18 }), c('Unrolled'), c('Tie', { initiative: 5, dexMod: 3 })]);

  it('goes by initiative, then Dex, with the unrolled last', () => {
    expect(names(f)).toEqual(['High', 'Tie', 'Low', 'Unrolled']);
  });

  it('wraps to a new round after the last turn', () => {
    let g = startFight(f);
    for (let i = 0; i < 4; i++) g = nextTurn(g);
    expect(g).toMatchObject({ turn: 0, round: 2 });
  });

  it('keeps the same combatant up when initiative changes mid-fight', () => {
    const g = { ...startFight(f), turn: 1 }; // Tie
    expect(currentCombatant(setInitiative(g, 'Unrolled', 20))?.name).toBe('Tie');
  });

  it('rolls initiative for a newcomer mid-fight and keeps the turn', () => {
    const g = { ...startFight(f), turn: 2 }; // Low
    const after = addCombatants(g, [c('Late')]);
    expect(after.combatants.find(x => x.name === 'Late')?.initiative).not.toBeNull();
    expect(currentCombatant(after)?.name).toBe('Low');
  });

  it('steps the turn back when someone earlier in the order leaves', () => {
    const g = { ...startFight(f), turn: 2 }; // Low
    const after = removeCombatant(g, 'High');
    expect(currentCombatant(after)?.name).toBe('Low');
  });

  it('hands the turn on, into a new round, when the last in line leaves on their turn', () => {
    const g = { ...startFight(f), turn: 3, round: 2 }; // Unrolled
    expect(removeCombatant(g, 'Unrolled')).toMatchObject({ turn: 0, round: 3 });
  });

  it('ends the fight when the last combatant leaves', () => {
    expect(removeCombatant(startFight(fight([c('Solo')])), 'Solo')).toMatchObject({ combatants: [], turn: -1 });
  });
});

describe('hit points', () => {
  it('takes damage from temp HP first', () => {
    expect(damage(c('A', { maxHp: 20, currentHp: 20, temp: 5 }), 8)).toMatchObject({ temp: 0, currentHp: 17 });
  });

  it('drops a PC to dying with fresh death saves, a monster to unconscious', () => {
    expect(damage(c('PC', { isPC: true, maxHp: 10, currentHp: 3, deathSaves: { s: 1, f: 1 } }), 9))
      .toMatchObject({ currentHp: 0, conditions: ['dying'], deathSaves: { s: 0, f: 0 } });
    expect(damage(c('Orc', { maxHp: 15, currentHp: 4 }), 10)).toMatchObject({ currentHp: 0, conditions: ['unconscious'] });
  });

  it('never marks a PC with no max HP as down', () => {
    expect(damage(c('New', { isPC: true, maxHp: 0, currentHp: 0 }), 5).conditions).toEqual([]);
  });

  it('revives to exactly the healing from 0, clearing death state', () => {
    const down = c('PC', { isPC: true, maxHp: 10, currentHp: 0, conditions: ['dying', 'prone'], deathSaves: { s: 2, f: 1 } });
    expect(heal(down, 4)).toMatchObject({ currentHp: 4, conditions: ['prone'], deathSaves: { s: 0, f: 0 } });
    expect(heal(c('B', { maxHp: 10, currentHp: 8 }), 5).currentHp).toBe(10);
  });

  it('keeps the higher temp HP rather than stacking', () => {
    expect(addTemp(addTemp(c('A'), 6), 4).temp).toBe(6);
  });

  it('fills HP when a max is set for the first time, and clamps after', () => {
    expect(setMaxHp(c('PC', { maxHp: 0, currentHp: 0 }), 30)).toMatchObject({ maxHp: 30, currentHp: 30 });
    expect(setMaxHp(c('A', { maxHp: 30, currentHp: 25 }), 20).currentHp).toBe(20);
  });

  it('applies the down rules when HP is typed in', () => {
    expect(setCurrentHp(c('Orc', { maxHp: 12, currentHp: 12 }), 0).conditions).toEqual(['unconscious']);
  });

  it('returns the same combatant for a change that does nothing', () => {
    const a = c('A');
    expect(damage(a, 0)).toBe(a);
    expect(heal(a, -2)).toBe(a);
    expect(setMaxHp(a, -1)).toBe(a);
  });
});

describe('death saves and conditions', () => {
  const dying = c('PC', { isPC: true, maxHp: 10, currentHp: 0, conditions: ['dying'] });

  it('stabilises at three successes and dies at three failures', () => {
    expect(setDeathSave({ ...dying, deathSaves: { s: 2, f: 1 } }, 's', 3)).toMatchObject({ conditions: ['stable'], deathSaves: { s: 3, f: 0 } });
    expect(setDeathSave(dying, 'f', 3).conditions).toEqual(['dead']);
    expect(setDeathSave(dying, 's', 1).conditions).toEqual(['dying']);
  });

  it('toggles a condition on and off', () => {
    const prone = toggleCondition(c('A'), 'prone');
    expect(prone.conditions).toEqual(['prone']);
    expect(toggleCondition(prone, 'prone').conditions).toEqual([]);
  });
});

describe('timed conditions', () => {
  // A before B in the order (higher initiative).
  const a = c('A', { initiative: 20 });
  const b = c('B', { initiative: 10 });

  it('gives a condition rounds to run, adding it if need be', () => {
    const held = setConditionRounds(a, 'frightened', 2);
    expect(held).toMatchObject({ conditions: ['frightened'], rounds: { frightened: 2 } });
    expect(setConditionRounds(held, 'frightened', null).rounds).toEqual({});
  });

  it('counts down at the end of the combatant’s own turn, and ends at 0', () => {
    let f = startFight(fight([setConditionRounds(a, 'frightened', 2), b]));
    f = nextTurn(f); // A's turn ends: 1 left
    expect(f.combatants.find(x => x.id === 'A')).toMatchObject({ conditions: ['frightened'], rounds: { frightened: 1 } });
    expect(f.expired).toEqual([]);
    f = nextTurn(f); // B's turn ends: A's untouched
    expect(f.combatants.find(x => x.id === 'A')?.rounds).toEqual({ frightened: 1 });
    f = nextTurn(f); // A's turn ends again: it runs out
    expect(f.combatants.find(x => x.id === 'A')?.conditions).toEqual([]);
    expect(f.expired).toEqual([{ name: 'A', conditions: ['frightened'] }]);
  });

  it('leaves open-ended conditions alone', () => {
    const f = nextTurn(startFight(fight([toggleCondition(a, 'prone'), b])));
    expect(f.combatants.find(x => x.id === 'A')?.conditions).toEqual(['prone']);
  });

  it('forgets a condition’s rounds when it’s cleared', () => {
    const timed = setConditionRounds(a, 'poisoned', 3);
    expect(toggleCondition(timed, 'poisoned')).toMatchObject({ conditions: [], rounds: {} });
  });

  it('has the rules for every condition a DM can pick', () => {
    for (const cond of CONDITIONS) expect(CONDITION_RULES[cond].length).toBeGreaterThan(10);
  });
});

describe('concentration', () => {
  const caster = toggleCondition(c('Mage', { maxHp: 30, currentHp: 30 }), 'concentrating');

  it('calls for a save after damage: DC 10, or half the damage if higher', () => {
    expect(concentrationDC(7)).toBe(10);
    expect(concentrationDC(26)).toBe(13);
    expect(damage(caster, 7).conCheck).toBe(10);
    expect(damage(caster, 26).conCheck).toBe(13);
  });

  it('keeps the spell when the save is held, and ends it when it’s lost', () => {
    const hit = damage(caster, 12);
    expect(resolveConcentration(hit, true)).toMatchObject({ conCheck: null, conditions: ['concentrating'] });
    expect(resolveConcentration(hit, false)).toMatchObject({ conCheck: null, conditions: [] });
  });

  it('ends when the caster drops to 0 HP', () => {
    const down = damage(caster, 30);
    expect(down.conditions).not.toContain('concentrating');
    expect(down.conCheck).toBeNull();
  });

  it('isn’t tested by damage that doesn’t touch it', () => {
    expect(damage(c('Fighter', { maxHp: 30, currentHp: 30 }), 12).conCheck).toBeNull();
  });
});
