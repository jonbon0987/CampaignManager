// House rules: what a table plays differently from the book. They're kept on the
// campaign as a short list the DM picks from common ones or writes, then read at
// the table, on the player page and by the assistant. They're words to play by:
// nothing here changes how the dice or the initiative tracker work. Pure.

export const RULE_TOPICS = ['Combat', 'Rest and healing', 'Characters', 'Table'] as const;
export type RuleTopic = typeof RULE_TOPICS[number];

export interface HouseRule {
  id: string;
  topic: RuleTopic;
  title: string;
  text: string;
}

export type CommonRule = Omit<HouseRule, 'id'>;

export const RULE_TITLE_MAX = 80;
export const RULE_TEXT_MAX = 600;

/** A starting point: the wording is the DM's to change once added. */
export const COMMON_RULES: CommonRule[] = [
  { topic: 'Combat', title: 'Flanking', text: 'Two allies on opposite sides of a foe each have advantage on melee attacks against it.' },
  { topic: 'Combat', title: 'Big crits', text: 'On a critical hit, one set of damage dice does its maximum and the other is rolled as usual.' },
  { topic: 'Combat', title: 'Fumbles are story', text: 'A natural 1 on an attack misses and the DM adds a complication. It never hurts you or an ally.' },
  { topic: 'Combat', title: 'Secret death saves', text: 'The DM rolls death saves behind the screen, so nobody knows how close it is.' },
  { topic: 'Combat', title: 'Potions as a bonus action', text: 'Drinking a potion yourself is a bonus action. Giving one to someone else is an action.' },
  { topic: 'Rest and healing', title: 'Gritty rests', text: 'A short rest takes 8 hours. A long rest takes 7 days somewhere safe.' },
  { topic: 'Rest and healing', title: 'Hit Dice back in full', text: 'A long rest restores all spent Hit Dice, not half.' },
  { topic: 'Rest and healing', title: 'Lingering wounds', text: 'Each time you drop to 0 hit points, you gain one level of exhaustion.' },
  { topic: 'Characters', title: 'A feat at 1st level', text: 'Every character starts with one feat of their choice.' },
  { topic: 'Characters', title: 'Maximum hit points', text: 'Take the maximum on the hit die at each new level instead of rolling.' },
  { topic: 'Characters', title: 'Point buy', text: 'Ability scores come from point buy, so the party starts even.' },
  { topic: 'Table', title: 'No PvP', text: 'Characters don’t attack, rob or charm each other unless both players agree.' },
  { topic: 'Table', title: 'Call it and check later', text: 'If a rule takes more than a minute to find, the DM rules on it now and we check after the session.' },
  { topic: 'Table', title: 'Absent players', text: 'A missing player’s character stays in the background, takes no harm and still earns XP.' },
];

const isTopic = (t: unknown): t is RuleTopic => (RULE_TOPICS as readonly unknown[]).includes(t);
const asText = (v: unknown) => (typeof v === 'string' ? v : '');

/** The rules stored on a campaign. The column is free-form JSON, so anything that isn't a rule is left out. */
export function rulesOf(value: unknown): HouseRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r): HouseRule[] => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string') return [];
    return [{ id: o.id, topic: isTopic(o.topic) ? o.topic : 'Table', title: asText(o.title), text: asText(o.text) }];
  });
}

/** The ones worth reading: a rule still being written, with nothing in it, isn't. */
export const writtenRules = (rules: HouseRule[]) => rules.filter(r => r.title.trim() || r.text.trim());

/** Rules under their topics, in topic order, leaving out empty topics. */
export function byTopic<T extends { topic: RuleTopic }>(rules: T[]): [RuleTopic, T[]][] {
  return RULE_TOPICS.flatMap((topic): [RuleTopic, T[]][] => {
    const inTopic = rules.filter(r => r.topic === topic);
    return inTopic.length > 0 ? [[topic, inTopic]] : [];
  });
}

/** The common rules this table hasn't added yet, matched by name. */
export function commonNotAdded(rules: HouseRule[]): CommonRule[] {
  const have = new Set(rules.map(r => r.title.trim().toLowerCase()));
  return COMMON_RULES.filter(c => !have.has(c.title.toLowerCase()));
}

/** The rules as lines of text, for the assistant and for an export. */
export const ruleLine = (r: Pick<HouseRule, 'title' | 'text'>) => {
  const title = r.title.trim();
  const text = r.text.trim();
  return title && text ? `${title}: ${text}` : title || text;
};
