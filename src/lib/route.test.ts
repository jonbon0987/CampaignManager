import { describe, it, expect } from 'vitest';
import { parseRoute, buildPath, type Route } from './route';

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
    ];
    for (const r of routes) {
      const path = buildPath(r);
      const [pathname, query] = path.split('?');
      expect(parseRoute(pathname, query ? `?${query}` : '')).toMatchObject(r);
    }
  });
});
