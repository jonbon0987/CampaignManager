import { describe, it, expect } from 'vitest';
import {
  creatureTypeColors, getTypeStyle,
  factionTypeColors, getFactionTypeStyle,
  hookCategoryStyles, getHookCategoryStyle,
  threadStateMeta, THREAD_STATES, getThreadState,
  moduleTypeMeta, getModuleTypeInfo,
} from './theme';

describe('getTypeStyle (creature types)', () => {
  it('returns the exact style for a known type', () => {
    expect(getTypeStyle('dragon')).toBe(creatureTypeColors.dragon);
  });
  it('falls back to "other" for null', () => {
    expect(getTypeStyle(null)).toBe(creatureTypeColors.other);
  });
  it('falls back to "other" for an unknown type', () => {
    expect(getTypeStyle('kaiju')).toBe(creatureTypeColors.other);
  });
});

describe('getFactionTypeStyle', () => {
  it('returns the exact style for a known type', () => {
    expect(getFactionTypeStyle('criminal')).toBe(factionTypeColors.criminal);
  });
  it('falls back to "other" for null and unknown', () => {
    expect(getFactionTypeStyle(null)).toBe(factionTypeColors.other);
    expect(getFactionTypeStyle('cult')).toBe(factionTypeColors.other);
  });
});

describe('getHookCategoryStyle', () => {
  it('returns the exact style for a known category', () => {
    expect(getHookCategoryStyle('main_plot')).toBe(hookCategoryStyles.main_plot);
  });
  it('defaults to "side_quest" for null and unknown', () => {
    expect(getHookCategoryStyle(null)).toBe(hookCategoryStyles.side_quest);
    expect(getHookCategoryStyle('nonsense')).toBe(hookCategoryStyles.side_quest);
  });
});

describe('getThreadState', () => {
  it('returns the metadata for a known state', () => {
    expect(getThreadState('seed')).toBe(threadStateMeta.seed);
    expect(getThreadState('resolved').label).toBe('Resolved');
  });
  it('defaults to "active" for null and unknown', () => {
    expect(getThreadState(null)).toBe(threadStateMeta.active);
    expect(getThreadState('archived')).toBe(threadStateMeta.active);
  });
  it('every THREAD_STATES entry has matching metadata', () => {
    for (const s of THREAD_STATES) {
      expect(threadStateMeta[s]).toBeDefined();
    }
  });
});

describe('getModuleTypeInfo', () => {
  it('returns the info for a known type', () => {
    expect(getModuleTypeInfo('heist')).toBe(moduleTypeMeta.heist);
  });
  it('defaults to "other" for null, undefined, and unknown', () => {
    expect(getModuleTypeInfo(null)).toBe(moduleTypeMeta.other);
    expect(getModuleTypeInfo(undefined)).toBe(moduleTypeMeta.other);
    expect(getModuleTypeInfo('mystery')).toBe(moduleTypeMeta.other);
  });
});

describe('taxonomy maps expose their fallback keys', () => {
  it('accessor default keys exist in their maps', () => {
    expect(creatureTypeColors.other).toBeDefined();
    expect(factionTypeColors.other).toBeDefined();
    expect(hookCategoryStyles.side_quest).toBeDefined();
    expect(threadStateMeta.active).toBeDefined();
    expect(moduleTypeMeta.other).toBeDefined();
  });
});
