import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import * as rules from '../lib/combat';
import type { Combatant, Condition, Fight } from '../lib/combat';

// What undo puts back: the HP side of a combatant, not their place in the order.
type Snapshot = Pick<Combatant, 'id' | 'currentHp' | 'maxHp' | 'temp' | 'conditions' | 'deathSaves'>;

/**
 * Runs a fight held by the caller, so the full-screen tracker can keep it in
 * local state and Play can save it on the session. HP changes can be undone,
 * newest first.
 */
export function useFight(fight: Fight, setFight: Dispatch<SetStateAction<Fight>>) {
  const history = useRef<Snapshot[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const order = useMemo(() => rules.turnOrder(fight.combatants), [fight.combatants]);

  // An HP change: remember the combatant as it was, then apply the rule.
  const hp = useCallback((id: string, change: (c: Combatant) => Combatant) => {
    const before = fight.combatants.find(c => c.id === id);
    if (!before || change(before) === before) return;
    const { currentHp, maxHp, temp, conditions, deathSaves } = before;
    history.current.push({ id, currentHp, maxHp, temp, conditions, deathSaves });
    setHistoryLen(history.current.length);
    setFight(f => rules.updateCombatant(f, id, change));
  }, [fight.combatants, setFight]);

  const undo = useCallback(() => {
    const snap = history.current.pop();
    if (!snap) return;
    setHistoryLen(history.current.length);
    setFight(f => rules.updateCombatant(f, snap.id, c => ({ ...c, ...snap })));
  }, [setFight]);

  return {
    fight,
    order,
    started: rules.isStarted(fight),
    current: rules.currentCombatant(fight),
    historyLen,
    undo,
    start: () => setFight(rules.startFight),
    next: () => setFight(rules.nextTurn),
    reset: () => setFight(rules.resetFight),
    rollAll: () => setFight(f => rules.rollInitiatives(f, 'all')),
    rollNPCs: () => setFight(f => rules.rollInitiatives(f, 'npcs')),
    setInitiative: (id: string, value: number | null) => setFight(f => rules.setInitiative(f, id, value)),
    add: (list: Combatant[]) => setFight(f => rules.addCombatants(f, list)),
    remove: (id: string) => setFight(f => rules.removeCombatant(f, id)),
    toggleCondition: (id: string, condition: Condition) => setFight(f => rules.updateCombatant(f, id, c => rules.toggleCondition(c, condition))),
    damage: (id: string, n: number) => hp(id, c => rules.damage(c, n)),
    heal: (id: string, n: number) => hp(id, c => rules.heal(c, n)),
    addTemp: (id: string, n: number) => hp(id, c => rules.addTemp(c, n)),
    setHp: (id: string, n: number) => hp(id, c => rules.setCurrentHp(c, n)),
    setMax: (id: string, n: number) => hp(id, c => rules.setMaxHp(c, n)),
    deathSave: (id: string, key: 's' | 'f', val: number) => hp(id, c => rules.setDeathSave(c, key, val)),
  };
}

export type FightControls = ReturnType<typeof useFight>;
