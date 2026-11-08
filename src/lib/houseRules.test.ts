import { describe, it, expect } from 'vitest';
import { COMMON_RULES, RULE_TEXT_MAX, RULE_TITLE_MAX, RULE_TOPICS, byTopic, commonNotAdded, ruleLine, rulesOf, writtenRules, type HouseRule } from './houseRules';

const rule = (over: Partial<HouseRule> = {}): HouseRule => ({ id: 'r1', topic: 'Combat', title: 'Flanking', text: 'Advantage.', ...over });

describe('rulesOf', () => {
  it('reads what’s stored', () => {
    expect(rulesOf([rule()])).toEqual([rule()]);
  });

  it('takes nothing from a campaign with no rules', () => {
    expect(rulesOf(null)).toEqual([]);
    expect(rulesOf(undefined)).toEqual([]);
    expect(rulesOf('nope')).toEqual([]);
  });

  it('leaves out what isn’t a rule, and repairs what it can', () => {
    expect(rulesOf([null, 7, { title: 'no id' }, { id: 'x', topic: 'Elsewhere', title: 3 }])).toEqual([{ id: 'x', topic: 'Table', title: '', text: '' }]);
  });
});

describe('the lists', () => {
  it('drops a rule with nothing in it from what gets read', () => {
    expect(writtenRules([rule(), rule({ id: 'r2', title: ' ', text: '' })]).map(r => r.id)).toEqual(['r1']);
  });

  it('groups by topic in topic order, leaving out empty ones', () => {
    const grouped = byTopic([rule({ id: 'a', topic: 'Table' }), rule({ id: 'b', topic: 'Combat' }), rule({ id: 'c', topic: 'Table' })]);
    expect(grouped.map(([t, rs]) => [t, rs.map(r => r.id)])).toEqual([['Combat', ['b']], ['Table', ['a', 'c']]]);
  });

  it('stops offering a common rule once it’s added, whatever its case', () => {
    expect(commonNotAdded([rule({ title: ' flanking ' })]).some(c => c.title === 'Flanking')).toBe(false);
    expect(commonNotAdded([]).length).toBe(COMMON_RULES.length);
  });

  it('writes a rule as one line', () => {
    expect(ruleLine(rule())).toBe('Flanking: Advantage.');
    expect(ruleLine(rule({ text: '' }))).toBe('Flanking');
    expect(ruleLine(rule({ title: '' }))).toBe('Advantage.');
  });
});

describe('the common rules', () => {
  it('fit their limits, have a known topic, and don’t repeat', () => {
    for (const c of COMMON_RULES) {
      expect(c.title.length).toBeLessThanOrEqual(RULE_TITLE_MAX);
      expect(c.text.length).toBeLessThanOrEqual(RULE_TEXT_MAX);
      expect(RULE_TOPICS).toContain(c.topic);
    }
    expect(new Set(COMMON_RULES.map(c => c.title)).size).toBe(COMMON_RULES.length);
  });
});
