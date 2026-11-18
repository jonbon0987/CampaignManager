import { describe, it, expect } from 'vitest';
import { parseRoute, buildPath, slugify, idSegment, resolveRef, matchesRef, sameRef, isShortRef, type Route } from './route';

describe('parseRoute', () => {
  it('treats "/" and unknown paths as no route', () => {
    expect(parseRoute('/')).toBeNull();
    expect(parseRoute('/settings')).toBeNull();
    expect(parseRoute('/w')).toBeNull();
    expect(parseRoute('/w/abc/c')).toBeNull();
  });

  it('reads a world, its tab and a record', () => {
    expect(parseRoute('/w/abc')).toEqual({ scope: 'world', worldId: 'abc', tab: 'overview', recordId: undefined });
    expect(parseRoute('/w/abc/npcs/n1')).toEqual({ scope: 'world', worldId: 'abc', tab: 'npcs', recordId: 'n1' });
  });

  it('reads a world tab’s view', () => {
    expect(parseRoute('/w/abc/combat/t1', '?view=random')).toMatchObject({ scope: 'world', tab: 'combat', recordId: 't1', view: 'random' });
  });

  it('reads the part open in a module', () => {
    expect(parseRoute('/w/abc/c/c1/modules/m1/p2')).toMatchObject({ scope: 'campaign', tab: 'modules', recordId: 'm1', sub: 'p2' });
    expect(parseRoute('/w/abc/c/c1/modules/m1')).toMatchObject({ recordId: 'm1', sub: undefined });
  });

  it('falls back to Overview for an unknown world tab', () => {
    expect(parseRoute('/w/abc/nonsense')).toMatchObject({ scope: 'world', tab: 'overview' });
  });

  it('reads a campaign, its tab, a record and the view', () => {
    expect(parseRoute('/w/abc/c/c1')).toEqual({ scope: 'campaign', worldId: 'abc', campaignId: 'c1', tab: 'overview', recordId: undefined, view: undefined });
    expect(parseRoute('/w/abc/c/c1/cast/npc9', '?view=list')).toEqual({ scope: 'campaign', worldId: 'abc', campaignId: 'c1', tab: 'cast', recordId: 'npc9', view: 'list' });
  });
});

describe('buildPath', () => {
  it('leaves out Overview and adds the view as a query', () => {
    expect(buildPath({ scope: 'world', worldId: 'abc', tab: 'overview' })).toBe('/w/abc');
    expect(buildPath({ scope: 'campaign', worldId: 'abc', campaignId: 'c1', tab: 'overview' })).toBe('/w/abc/c/c1');
    expect(buildPath({ scope: 'campaign', worldId: 'abc', campaignId: 'c1', tab: 'modules', view: 'web' })).toBe('/w/abc/c/c1/modules?view=web');
  });

  it('round-trips through parseRoute', () => {
    const routes: Route[] = [
      { scope: 'world', worldId: 'w 1', tab: 'locations', recordId: 'l/2' },
      { scope: 'campaign', worldId: 'w', campaignId: 'c', tab: 'sessions', recordId: 's', view: 'timeline' },
      { scope: 'world', worldId: 'w', tab: 'combat', recordId: 'sb1', view: 'bestiary' },
      { scope: 'campaign', worldId: 'w', campaignId: 'c', tab: 'modules', recordId: 'm1', sub: 'part 2' },
      { scope: 'campaign', worldId: 'w', campaignId: 'c', tab: 'combat', recordId: 't1', view: 'random' },
    ];
    for (const r of routes) {
      const path = buildPath(r);
      const [pathname, query] = path.split('?');
      expect(parseRoute(pathname, query ? `?${query}` : '')).toMatchObject(r);
    }
  });
});

const W = '9222a9fe-8819-402f-92d0-0871230e8914';
const C = '264093e6-b240-49ee-9147-292bba7b5768';
const E = '5ca1c4b6-5195-47ed-9ce5-ea4e5f8cf913';

describe('readable ids', () => {
  it('slugifies names to lower-case ASCII words', () => {
    expect(slugify('The Goblin Ambush!')).toBe('the-goblin-ambush');
    expect(slugify('Faerûn’s Crown — Part II')).toBe('faeruns-crown-part-ii');
    expect(slugify('✦✦✦')).toBe('');
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(30))).toBe('a'.repeat(30));
  });

  it('writes a UUID as its name and first 8 characters, and other ids whole', () => {
    expect(idSegment(E, 'Goblin Ambush')).toBe('goblin-ambush-5ca1c4b6');
    expect(idSegment(E)).toBe('5ca1c4b6');
    expect(idSegment(E, '✦')).toBe('5ca1c4b6');
    expect(idSegment('srd-goblin', 'Goblin')).toBe('srd-goblin');
  });

  it('builds readable paths from names', () => {
    const route: Route = { scope: 'campaign', worldId: W, campaignId: C, tab: 'combat', recordId: E, view: 'random' };
    expect(buildPath(route, { world: 'Test World', campaign: 'Test', record: 'Goblin Ambush' }))
      .toBe('/w/test-world-9222a9fe/c/test-264093e6/combat/goblin-ambush-5ca1c4b6?view=random');
    expect(buildPath(route)).toBe('/w/9222a9fe/c/264093e6/combat/5ca1c4b6?view=random');
  });

  it('reads the short id back from a readable segment, whatever the name says', () => {
    expect(parseRoute('/w/test-world-9222a9fe/c/test-264093e6/combat/renamed-since-5ca1c4b6')).toMatchObject({
      worldId: '9222a9fe', campaignId: '264093e6', tab: 'combat', recordId: '5ca1c4b6',
    });
    expect(parseRoute('/w/9222a9fe/c/264093e6/modules/m-0a885d60/act-one-f964d172')).toMatchObject({ recordId: '0a885d60', sub: 'f964d172' });
  });

  it('still reads an older link with full ids', () => {
    expect(parseRoute(`/w/${W}/c/${C}/combat/${E}`)).toMatchObject({ worldId: W, campaignId: C, recordId: E });
  });

  it('resolves a short id among full ids, preferring an exact match', () => {
    const ids = [C, E, W];
    expect(resolveRef('5ca1c4b6', ids)).toBe(E);
    expect(resolveRef('5CA1C4B6', ids)).toBe(E);
    expect(resolveRef(E, ids)).toBe(E);
    expect(resolveRef('deadbeef', ids)).toBeUndefined();
    expect(resolveRef('5ca1', ids)).toBeUndefined();
    expect(resolveRef(undefined, ids)).toBeUndefined();
  });

  it('knows when a full id and a short one name the same record', () => {
    expect(matchesRef(E, '5ca1c4b6')).toBe(true);
    expect(matchesRef(E, '9222a9fe')).toBe(false);
    expect(sameRef(E, '5ca1c4b6')).toBe(true);
    expect(sameRef('5ca1c4b6', E)).toBe(true);
    expect(sameRef(E, '5ca1c4b6-0000-4000-8000-000000000000')).toBe(false);
    expect(sameRef(undefined, undefined)).toBe(true);
    expect(sameRef(E, undefined)).toBe(false);
    expect(isShortRef('5ca1c4b6')).toBe(true);
    expect(isShortRef(E)).toBe(false);
  });
});
