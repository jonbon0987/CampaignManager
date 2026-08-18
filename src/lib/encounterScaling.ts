// src/lib/encounterScaling.ts
// -----------------------------------------------------------
// D&D 5E encounter math for the random-table roller: XP budgeting, party-scaled
// creature counts, and the battlefield / complication / loot layers. Adapted
// from the design prototype's roll engine into typed, testable functions.
//
// Pure — no React/DB. The randomized layer pickers take an injectable rng so
// results are deterministic in tests.
// -----------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard' | 'deadly';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'deadly'];

// CR → XP (5E DMG). Keyed by the CR strings used on stat blocks.
export const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
  '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
};

// Per-character XP thresholds by level → [easy, medium, hard, deadly].
const THRESH: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
};

export const crXP = (cr: string | null | undefined): number => CR_XP[String(cr ?? '').trim()] ?? 50;

/** 5E "encounter multiplier" — adjusted XP grows with the number of foes. */
export const encMult = (n: number): number =>
  n <= 1 ? 1 : n === 2 ? 1.5 : n <= 6 ? 2 : n <= 10 ? 2.5 : n <= 14 ? 3 : 4;

/** XP budget for a party of `size` at `level` at the given difficulty. */
export function budgetFor(diff: Difficulty, size: number, level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.round(level)));
  const idx = Math.max(0, DIFFICULTIES.indexOf(diff));
  return THRESH[lvl][idx] * Math.max(1, size);
}

export interface ScaleCreature {
  id: string;
  name: string;
  cr: string | null;
  dmNotes?: string | null;
  note?: string | null;   // per-entry note
  isNew?: boolean;        // improvised (not from the library)
}

export interface RosterEntry {
  creature: ScaleCreature;
  count: number;
  note: string | null;
  isNew: boolean;
}

export interface EncounterParams {
  partySize: number;
  partyLevel: number;
  difficulty: Difficulty;
  socialBias?: number;   // 0 = all combat, 1 = all social
}

export interface ScaledEncounter {
  roster: RosterEntry[];
  total: number;   // total creature count
  xp: number;      // adjusted XP reached
  tier: Difficulty;
  budget: number;
}

/**
 * Scale a set of linked creatures to the party: start one of each, then multiply
 * the cheapest ("grunt") until adjusted XP reaches ~90% of budget — capped at
 * 6 + partySize creatures and never overshooting 1.25× budget. Reports the
 * difficulty tier actually reached.
 */
export function scaleRoster(creatures: ScaleCreature[], params: EncounterParams): ScaledEncounter {
  const { partySize: size, partyLevel: level, difficulty: diff } = params;
  const budget = budgetFor(diff, size, level);

  if (creatures.length === 0) {
    return { roster: [], total: 0, xp: 0, tier: 'easy', budget };
  }

  const counts = new Map<string, number>();
  creatures.forEach(c => counts.set(c.id, 1));

  const totalCount = () => [...counts.values()].reduce((s, v) => s + v, 0);
  const adjXP = () => {
    const raw = creatures.reduce((s, c) => s + crXP(c.cr) * (counts.get(c.id) ?? 0), 0);
    return raw * encMult(totalCount());
  };

  const grunt = [...creatures].sort((a, b) => crXP(a.cr) - crXP(b.cr))[0];
  let guard = 0;
  while (adjXP() < budget * 0.9 && guard++ < 40) {
    if (totalCount() >= 6 + size) break;
    counts.set(grunt.id, (counts.get(grunt.id) ?? 0) + 1);
    if (adjXP() > budget * 1.25) { counts.set(grunt.id, (counts.get(grunt.id) ?? 1) - 1); break; }
  }

  const roster: RosterEntry[] = creatures.map(c => ({
    creature: c, count: counts.get(c.id) ?? 1, note: c.note ?? null, isNew: !!c.isNew,
  }));
  const xp = Math.round(adjXP());

  const perDiff = DIFFICULTIES.map(d => budgetFor(d, size, level));
  let tier: Difficulty = 'easy';
  DIFFICULTIES.forEach((d, i) => { if (xp >= perDiff[i]) tier = d; });

  const total = roster.reduce((s, r) => s + r.count, 0);
  return { roster, total, xp, tier, budget };
}

// ── Battlefield / complication / loot layers ──────────────────────────────

export interface Layer { name: string; text: string; }

const pick = <T>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

const TERRAIN: Record<'forest' | 'mountain' | 'urban' | 'any', Layer[]> = {
  forest: [
    { name: 'Root-tangled floor', text: 'Half the field is difficult terrain; a creature that Dashes makes a DC 10 Dexterity save or falls prone.' },
    { name: 'Low canopy & deadfall', text: 'Scattered heavy cover. An attacker in the branches opens with a round of advantage from above.' },
    { name: 'Boggy hollow', text: 'A 15-ft. patch of sucking mud is difficult terrain; anything dropped in it sinks out of easy reach.' },
    { name: 'Steep game trail', text: 'The fight runs along a slope — the uphill side holds the high ground the whole scene.' },
  ],
  mountain: [
    { name: 'Narrow ledge', text: 'A 5-ft. path over a 30-ft. drop. Forced movement or a failed DC 12 Acrobatics ends in a fall.' },
    { name: 'Loose scree', text: 'Difficult terrain; the first creature to Dash across triggers a slide — DC 12 Dexterity or knocked prone.' },
    { name: 'Wind-scoured pass', text: 'Ranged attacks beyond 30 ft. have disadvantage; small flames are torn out at once.' },
    { name: 'Frozen switchback', text: 'Sheet ice — difficult terrain; a natural 1 on an attack sends the attacker sprawling prone.' },
  ],
  urban: [
    { name: 'Cluttered alley', text: 'Crates and barrels give half cover everywhere; a shove into them deals 1d4 and costs a turn to rise.' },
    { name: 'Rain-slick rooftops', text: 'The fight climbs. A failed DC 12 Acrobatics on a jump means a 20-ft. fall into the street.' },
    { name: 'Crowded thoroughfare', text: 'Bystanders everywhere — area effects risk collateral, and the watch arrives in 1d4 rounds.' },
    { name: 'Guttering lamplight', text: 'Dim light throughout; anything past 30 ft. is lightly obscured.' },
  ],
  any: [
    { name: 'Broken ground', text: 'Rubble and pits — a third of the field is difficult terrain, ideal for a fighting retreat.' },
    { name: 'The chokepoint', text: 'A doorway only two can pass abreast — whoever holds it controls the fight.' },
    { name: 'Bad footing & shadow', text: 'Uneven, dim ground; both sides fight a little blind.' },
    { name: 'Open killing ground', text: 'No cover for 40 ft. — ranged foes have the edge; melee must close under fire.' },
  ],
};

/** Classify a region/name hint into a terrain biome and pick a battlefield. */
export function pickTerrain(hint: string, rng: () => number = Math.random): Layer {
  const src = hint.toLowerCase();
  const biome = /wood|forest|whit|verge|grove|jungle|swamp/.test(src) ? 'forest'
    : /frost|peak|mountain|road|reach|pass|hill|cliff|cave/.test(src) ? 'mountain'
    : /arbor|city|alley|urban|market|keep|castle|street|town|dungeon/.test(src) ? 'urban'
    : 'any';
  return pick(TERRAIN[biome], rng);
}

const COMPLICATIONS: Layer[] = [
  { name: 'Reinforcements', text: 'At the end of round 2, 1d4 more of the weakest foe arrive from the way the party came in.' },
  { name: 'A hostage in the middle', text: 'One foe holds an innocent (or the prize) — a stray AoE or a killing blow costs the party more than XP.' },
  { name: 'The ground gives way', text: 'When anyone is first bloodied, the floor cracks — a 10-ft. line makes a DC 13 Dexterity save or drops with it.' },
  { name: "It's a distraction", text: 'The real prize is elsewhere — a theft, a fire, a fleeing figure. Winning the fight loses the objective unless someone breaks off.' },
  { name: 'Wild-magic bleed', text: 'The Weave is thin here: the first spell cast this fight triggers a surge (roll on a Wild Magic table).' },
  { name: 'The light fails', text: 'A lantern shatters, or the sun drops behind the ridge — after round 1 the field goes to dim light, then dark.' },
  { name: 'They want one of you', text: 'The foes fight to capture, not kill — focusing the PC with the lowest current HP and trying to drag them off.' },
  { name: 'No line of retreat', text: 'A door bars, a bridge burns — there is no backing out of this one. It ends here.' },
];

export const pickComplication = (rng: () => number = Math.random): Layer => pick(COMPLICATIONS, rng);

const FIND = ['a bloodstained trail-map with one town circled', 'a purse of foreign coin', 'a signet none of them should be carrying', 'a folded letter, half-burned', 'a ring of keys to somewhere else', 'a token stamped with a black thorn'];
const LOOT_ITEM = ['a Potion of Healing', 'a plain +1 dagger', 'a Cloak of Billowing (someone loved it)', 'a bundle of three +1 arrows', 'a scroll of one random 1st-level spell'];

export interface Loot { coins: string; find: string; item: string | null; }

export function pickLoot(tier: Difficulty, rng: () => number = Math.random): Loot {
  const coins: Record<Difficulty, string> = {
    easy: '2d6 sp and loose copper',
    medium: '2d6 × 10 gp between them',
    hard: '3d6 × 10 gp, plus a gem or two (25 gp each)',
    deadly: '2d6 × 100 gp and something worth locking away',
  };
  return {
    coins: coins[tier] ?? coins.medium,
    find: pick(FIND, rng),
    item: (tier === 'hard' || tier === 'deadly') ? pick(LOOT_ITEM, rng) : null,
  };
}

/**
 * A quick improvised stat line for an entry with no linked creature — a generic
 * brute scaled to the party's level. Deterministic (no rng, no API call).
 */
export function synthCreature(name: string, partyLevel: number): ScaleCreature {
  const cr = partyLevel <= 3 ? '1' : partyLevel <= 6 ? '2' : partyLevel <= 10 ? '4' : '6';
  const base = name.trim().replace(/s$/, '') || 'Foe';
  return { id: `synth-${base.toLowerCase()}-${cr}`, name: `${base} (improvised)`, cr, isNew: true,
    dmNotes: 'Improvised to fit the party — a quick brute the DM can refine before running it.' };
}

// ── Full combat / social builders ─────────────────────────────────────────

export interface CombatResult {
  mode: 'combat';
  title: string;
  scene: string;
  roster: RosterEntry[];
  total: number;
  xp: number;
  tier: Difficulty;
  budget: number;
  terrain: Layer;
  complication: Layer;
  loot: Loot;
  tactics: string;
}

/** Build a party-scaled combat encounter from resolved creatures. */
export function buildCombat(
  args: { title: string; scene: string; creatures: ScaleCreature[]; regionHint: string },
  params: EncounterParams,
  rng: () => number = Math.random,
): CombatResult {
  const scaled = scaleRoster(args.creatures, params);
  const tactics = scaled.roster.map(r => r.creature.dmNotes).filter(Boolean).slice(0, 3).join(' ')
    + (scaled.roster.some(r => r.isNew) ? ' The improvised creature is a starting point — tweak it before you run it.' : '');
  return {
    mode: 'combat',
    title: args.title,
    scene: args.scene,
    roster: scaled.roster,
    total: scaled.total,
    xp: scaled.xp,
    tier: scaled.tier,
    budget: scaled.budget,
    terrain: pickTerrain(`${args.regionHint} ${args.title}`, rng),
    complication: pickComplication(rng),
    loot: pickLoot(scaled.tier, rng),
    tactics: tactics.trim(),
  };
}

export interface SocialCheck { skill: string; dc: number; success: string; fail: string; }
export interface SocialNPC { name: string; role: string; want: string; }
export interface SocialResult {
  mode: 'social';
  title: string;
  scene: string;
  goal: string;
  npcs: SocialNPC[];
  successes: number;
  failures: number;
  checks: SocialCheck[];
  tactics: string;
}

const socialCounts = (d: Difficulty): [number, number] =>
  d === 'easy' ? [3, 3] : d === 'medium' ? [4, 3] : d === 'hard' ? [5, 3] : [6, 4];
const socialDC = (d: Difficulty, level: number): number =>
  ({ easy: 10, medium: 12, hard: 14, deadly: 16 }[d]) + Math.floor(level / 6);

/** Build a social encounter scaffold (skill challenge) from the entry text. */
export function buildSocial(
  args: { title: string; scene: string },
  params: EncounterParams,
): SocialResult {
  const [successes, failures] = socialCounts(params.difficulty);
  const dc = socialDC(params.difficulty, params.partyLevel);
  const key = `${args.title} ${args.scene}`.toLowerCase();

  let npc: SocialNPC;
  let goal: string;
  if (/watch|patrol|guard/.test(key)) {
    npc = { name: 'Watch Sergeant', role: 'City watch', want: 'To move the party along without a scene.' };
    goal = 'Talk (or slip) past the patrol';
  } else if (/refugee|pilgrim|column/.test(key)) {
    npc = { name: 'Column elder', role: 'Refugee leader', want: 'Safe passage and someone to believe their warning.' };
    goal = 'Earn their trust and learn what they fled';
  } else if (/fey|sprite|fae/.test(key)) {
    npc = { name: 'The grinning sprite', role: 'Fey trickster', want: 'A bargain skewed in its favor — paid in memory or a promise.' };
    goal = 'Strike a bargain without being cheated';
  } else {
    npc = { name: 'Stranger on the road', role: 'Wanderer', want: 'Something the party has, or something only they can do.' };
    goal = "Find out what they really want";
  }

  const allChecks: SocialCheck[] = [
    { skill: 'Persuasion', dc, success: 'They lower their guard and offer a real concession.', fail: 'They dig in; the next check is at +1 DC.' },
    { skill: 'Insight', dc: dc - 1, success: 'You read the lie beneath the offer — advantage on your next social check here.', fail: 'You misjudge the room and tip your hand.' },
    { skill: 'Deception / Intimidation', dc: dc + 1, success: 'Your bluff (or threat) lands and buys leverage.', fail: 'It backfires — count a failure and raise the stakes.' },
    { skill: 'History / Arcana', dc, success: "You recall a detail that gives you an angle they can't refuse.", fail: 'Nothing useful comes to mind.' },
  ];
  const checks = allChecks.slice(0, params.difficulty === 'deadly' ? 4 : 3);
  const tactics = `Run as a skill challenge: ${successes} successes before ${failures} failures. Any PC can try; a strong roleplay setup grants the next PC advantage. Each failure escalates — the ${npc.role.toLowerCase()} grows suspicious, draws a crowd, or reaches for a weapon. On the final failure it can tip into combat.`;

  return { mode: 'social', title: args.title, scene: args.scene, goal, npcs: [npc], successes, failures, checks, tactics };
}
