// The app's address: which world, which campaign, which tab, which record, and
// which view of the tab. Kept in the URL so Back, refresh and bookmarks work.
//
//   /w/:worldId                              the world's Overview
//   /w/:worldId/:worldTab[/:recordId][?view=random]
//                                            a world tab, a record in it, and its view
//   /w/:worldId/c/:campaignId                a campaign's Home
//   /w/:worldId/c/:campaignId/:tab[/:recordId[/:sub]][?view=web]
//                                            a campaign tab, a record, a part of it
//                                            (a module's part), and the tab's view
//
// Anything else (the bare "/") means "wherever you were last".

import type { Tab } from '../App';
import type { WorldTab } from '../types/world';

export const CAMPAIGN_TABS: readonly Tab[] = [
  'overview', 'cast', 'lore', 'locations', 'items', 'threads', 'ideas',
  'modules', 'sessions', 'combat', 'settings',
];
export const WORLD_TABS: readonly WorldTab[] = ['overview', 'lore', 'locations', 'npcs', 'combat', 'timeline'];

export type Route =
  | { scope: 'world'; worldId: string; tab: WorldTab; recordId?: string; view?: string }
  | { scope: 'campaign'; worldId: string; campaignId: string; tab: Tab; recordId?: string; sub?: string; view?: string };

const isCampaignTab = (s: string): s is Tab => (CAMPAIGN_TABS as readonly string[]).includes(s);
const isWorldTab = (s: string): s is WorldTab => (WORLD_TABS as readonly string[]).includes(s);

/** Reads a route from a pathname and query string, or null for "/" and anything unrecognised. */
export function parseRoute(pathname: string, search = ''): Route | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'w' || !parts[1]) return null;
  const worldId = parts[1];
  const view = new URLSearchParams(search).get('view') ?? undefined;

  if (parts[2] === 'c') {
    const campaignId = parts[3];
    if (!campaignId) return null;
    const tab = parts[4] && isCampaignTab(parts[4]) ? parts[4] : 'overview';
    const recordId = parts[5] || undefined;
    return { scope: 'campaign', worldId, campaignId, tab, recordId, sub: (recordId && parts[6]) || undefined, view };
  }

  const tab = parts[2] && isWorldTab(parts[2]) ? parts[2] : 'overview';
  return { scope: 'world', worldId, tab, recordId: parts[3] || undefined, view };
}

/** The path and query string for a route. Overview is the default tab, so it is left out. */
export function buildPath(route: Route): string {
  const seg = (s: string) => encodeURIComponent(s);
  const withView = (path: string) => (route.view ? `${path}?view=${encodeURIComponent(route.view)}` : path);
  if (route.scope === 'world') {
    if (route.tab === 'overview') return `/w/${seg(route.worldId)}`;
    return withView(`/w/${seg(route.worldId)}/${route.tab}${route.recordId ? `/${seg(route.recordId)}` : ''}`);
  }
  const base = `/w/${seg(route.worldId)}/c/${seg(route.campaignId)}`;
  if (route.tab === 'overview' && !route.recordId) return base;
  const record = route.recordId ? `/${seg(route.recordId)}${route.sub ? `/${seg(route.sub)}` : ''}` : '';
  return withView(`${base}/${route.tab}${record}`);
}
