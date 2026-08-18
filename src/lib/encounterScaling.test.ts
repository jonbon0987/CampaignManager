import { describe, it, expect } from 'vitest';
import {
  crXP,
  encMult,
  budgetFor,
  scaleRoster,
  pickTerrain,
  pickComplication,
  pickLoot,
  synthCreature,
  buildCombat,
  buildSocial,
  type ScaleCreature,
  type EncounterParams,
} from './encounterScaling';

const creature = (id: string, cr: string, name = id): ScaleCreature => ({ id, name, cr });
const params = (over: Partial<EncounterParams> = {}): EncounterParams =>
  ({ partySize: 4, partyLevel: 5, difficulty: 'medium', ...over });

describe('xp helpers', () => {
  it('crXP maps CR strings, defaults to 50', () => {
    expect(crXP('1/4')).toBe(50);
    expect(crXP('5')).toBe(1800);
    expect(crXP(null)).toBe(50);
    expect(crXP('nonsense')).toBe(50);
  });
  it('encMult follows the 5E curve', () => {
    expect(encMult(1)).toBe(1);
    expect(encMult(2)).toBe(1.5);
    expect(encMult(5)).toBe(2);
    expect(encMult(8)).toBe(2.5);
    expect(encMult(12)).toBe(3);
    expect(encMult(20)).toBe(4);
  });
  it('budgetFor multiplies threshold by party size', () => {
    // level 5 medium threshold = 500/char
    expect(budgetFor('medium', 4, 5)).toBe(2000);
    expect(budgetFor('deadly', 1, 1)).toBe(100);
  });
  it('budgetFor clamps level to 1..20', () => {
    expect(budgetFor('easy', 1, 0)).toBe(budgetFor('easy', 1, 1));
    expect(budgetFor('easy', 1, 99)).toBe(budgetFor('easy', 1, 20));
  });
});

describe('scaleRoster', () => {
  it('returns an empty roster for no creatures', () => {
    const s = scaleRoster([], params());
    expect(s.roster).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.tier).toBe('easy');
  });

  it('multiplies the cheapest grunt toward budget', () => {
    // party 4 @ lvl5 medium → budget 2000. Wolves CR 1/4 (50xp).
    const s = scaleRoster([creature('wolf', '1/4')], params());
    expect(s.total).toBeGreaterThan(1);
    expect(s.total).toBeLessThanOrEqual(6 + 4); // cap
    expect(s.xp).toBeGreaterThan(0);
  });

  it('keeps a solo boss that already overshoots at count 1', () => {
    // CR 10 (5900xp) vs easy budget for party 1 @ lvl1
    const s = scaleRoster([creature('boss', '10')], params({ partySize: 1, partyLevel: 1, difficulty: 'easy' }));
    expect(s.roster[0].count).toBe(1);
    expect(s.tier).toBe('deadly'); // massively over budget
  });

  it('never exceeds the 6 + partySize cap', () => {
    const s = scaleRoster([creature('rat', '0')], params({ partySize: 3 }));
    expect(s.total).toBeLessThanOrEqual(9);
  });

  it('reports a higher tier for a harder target', () => {
    const easy = scaleRoster([creature('w', '1/4')], params({ difficulty: 'easy' }));
    const deadly = scaleRoster([creature('w', '1/4')], params({ difficulty: 'deadly' }));
    expect(deadly.xp).toBeGreaterThanOrEqual(easy.xp);
  });
});

describe('layer pickers', () => {
  it('pickTerrain classifies biome from the hint', () => {
    expect(pickTerrain('Whitewood Wilds', () => 0).name).toBe('Root-tangled floor');   // forest[0]
    expect(pickTerrain('Frostpeak Road', () => 0).name).toBe('Narrow ledge');           // mountain[0]
    expect(pickTerrain('Arborath Back-Alleys', () => 0).name).toBe('Cluttered alley');  // urban[0]
    expect(pickTerrain('somewhere vague', () => 0).name).toBe('Broken ground');         // any[0]
  });
  it('pickComplication is deterministic with injected rng', () => {
    expect(pickComplication(() => 0).name).toBe('Reinforcements');
  });
  it('pickLoot only grants a magic item at hard/deadly', () => {
    expect(pickLoot('easy', () => 0).item).toBeNull();
    expect(pickLoot('medium', () => 0).item).toBeNull();
    expect(pickLoot('hard', () => 0).item).not.toBeNull();
    expect(pickLoot('deadly', () => 0).item).not.toBeNull();
  });
});

describe('synthCreature', () => {
  it('scales CR by party level and flags improvised', () => {
    expect(synthCreature('Owlbears', 2).cr).toBe('1');
    expect(synthCreature('Owlbears', 8).cr).toBe('4');
    expect(synthCreature('Owlbears', 15).cr).toBe('6');
    expect(synthCreature('Owlbears', 2).isNew).toBe(true);
  });
});

describe('buildCombat', () => {
  it('assembles a scaled combat result with layers', () => {
    const res = buildCombat(
      { title: 'Wolf pack', scene: 'Winter-starved wolves.', creatures: [creature('wolf', '1/4')], regionHint: 'Frostpeak Road' },
      params(),
      () => 0,
    );
    expect(res.mode).toBe('combat');
    expect(res.roster.length).toBe(1);
    expect(res.terrain.name).toBe('Narrow ledge'); // mountain via "Frostpeak"
    expect(res.complication.name).toBe('Reinforcements');
    expect(res.total).toBeGreaterThan(0);
  });
});

describe('buildSocial', () => {
  it('scaffolds a skill challenge with success/failure counts', () => {
    const res = buildSocial({ title: 'The patrol', scene: 'A watch stops the party.' }, params({ difficulty: 'hard' }));
    expect(res.mode).toBe('social');
    expect(res.successes).toBe(5);
    expect(res.failures).toBe(3);
    expect(res.npcs[0].name).toBe('Watch Sergeant');
    expect(res.checks.length).toBe(3);
  });
  it('gives 4 checks on deadly', () => {
    expect(buildSocial({ title: 'x', scene: 'y' }, params({ difficulty: 'deadly' })).checks.length).toBe(4);
  });
});
