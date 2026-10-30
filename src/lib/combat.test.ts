import { describe, it, expect } from 'vitest';
import {
  addCombatants, addTemp, combatantsFromEncounter, combatantsFromParty, currentCombatant, damage, heal,
  newCombatant, nextTurn, removeCombatant, setCurrentHp, setDeathSave, setInitiative, setMaxHp,
  startFight, toggleCondition, turnOrder, type Combatant, type Fight,
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
