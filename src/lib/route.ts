// The app's address: which world, which campaign, which tab, which record, and
// which view of the tab. Kept in the URL so Back, refresh and bookmarks work.
//
//   /w/:worldId                              the world's Overview
//   /w/:worldId/:worldTab[/:recordId][?view=random]
//                                            a world tab, a record in it, and its view
//   /w/:worldId/c/:campaignId                a campaign's Home
//   /w/:worldId/c/:campaignId/:tab[/:recordId[/:sub]][?view=web]
//                                            a campaign tab, a record, what's open
//                                            in it (a module's part or scene), and
//                                            the tab's view
//
// Anything else (the bare "/") means "wherever you were last".
//
// Each id segment reads as the record's name and the first 8 characters of its
// id: /w/test-world-9222a9fe/c/test-264093e6/combat/goblin-ambush-5ca1c4b6.
// Only the 8 characters are looked up (resolveRef), so a rename never breaks a
// link; the name follows the current title. A full id (an older link) still
// works, and so does an id that isn't a UUID, which is written out whole.

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

// ─── Ids in the address ─────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[0-9a-f]{8}$/i;
const TRAILING_SHORT = /(?:^|-)([0-9a-f]{8})$/i;
const SHORT_LENGTH = 8;

/** A name as a URL slug: lower case, ASCII letters and digits, single hyphens. */
export function slugify(name: string, max = 48): string {
  const slug = name
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > max ? slug.slice(0, max).replace(/-+[^-]*$/, '') || slug.slice(0, max) : slug;
}

/** The short form of an id: its first 8 characters for a UUID, else null. */
function shortOf(id: string): string | null {
  if (UUID.test(id)) return id.slice(0, SHORT_LENGTH).toLowerCase();
  if (SHORT.test(id)) return id.toLowerCase();
  return null;
}

/** How an id is written in the address: "name-1a2b3c4d" (or just "1a2b3c4d" without a name); other ids whole. */
export function idSegment(id: string, name?: string | null): string {
  const short = shortOf(id);
  if (!short) return id;
  const slug = name ? slugify(name) : '';
  return slug ? `${slug}-${short}` : short;
}

/** What an address segment refers to: a full id, an 8-character short id, or (not a UUID) the segment itself. */
export function refFromSegment(segment: string): string {
  if (UUID.test(segment)) return segment.toLowerCase();
  const m = TRAILING_SHORT.exec(segment);
  return m ? m[1].toLowerCase() : segment;
}

/** Whether `id` is the record a reference names (the same id, or a short id it begins with). */
export function matchesRef(id: string, ref: string): boolean {
  if (id === ref) return true;
  return SHORT.test(ref) && id.toLowerCase().startsWith(ref.toLowerCase());
}

/** True when two ids or references could name the same record. */
export function sameRef(a: string | undefined, b: string | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const sa = shortOf(a), sb = shortOf(b);
  return sa !== null && sa === sb && (!UUID.test(a) || !UUID.test(b) || a.toLowerCase() === b.toLowerCase());
}

/** The full id a reference names among `ids`, or undefined when none does yet. */
export function resolveRef(ref: string | null | undefined, ids: Iterable<string>): string | undefined {
  if (!ref) return undefined;
  let found: string | undefined;
  for (const id of ids) {
    if (id === ref) return id;
    if (!found && matchesRef(id, ref)) found = id;
  }
  return found;
}

/** True for a reference that still has to be looked up (a short id). */
export const isShortRef = (ref: string | null | undefined): ref is string => !!ref && SHORT.test(ref);

/** The names the address shows beside each id. Any left out show as the short id alone. */
export interface RouteNames {
  world?: string | null;
  campaign?: string | null;
  record?: string | null;
  sub?: string | null;
}

const isCampaignTab = (s: string): s is Tab => (CAMPAIGN_TABS as readonly string[]).includes(s);
const isWorldTab = (s: string): s is WorldTab => (WORLD_TABS as readonly string[]).includes(s);

/** Reads a route from a pathname and query string, or null for "/" and anything unrecognised. */
export function parseRoute(pathname: string, search = ''): Route | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'w' || !parts[1]) return null;
  const ref = (i: number) => (parts[i] ? refFromSegment(parts[i]) : undefined);
  const worldId = ref(1)!;
  const view = new URLSearchParams(search).get('view') ?? undefined;

  if (parts[2] === 'c') {
    const campaignId = ref(3);
    if (!campaignId) return null;
    const tab = parts[4] && isCampaignTab(parts[4]) ? parts[4] : 'overview';
    const recordId = ref(5);
    return { scope: 'campaign', worldId, campaignId, tab, recordId, sub: (recordId && ref(6)) || undefined, view };
  }

  const tab = parts[2] && isWorldTab(parts[2]) ? parts[2] : 'overview';
  return { scope: 'world', worldId, tab, recordId: ref(3), view };
}

/**
 * The path and query string for a route, with each id written beside its name
 * (see idSegment). Overview is the default tab, so it is left out.
 */
export function buildPath(route: Route, names: RouteNames = {}): string {
  const seg = (id: string, name?: string | null) => encodeURIComponent(idSegment(id, name));
  const withView = (path: string) => (route.view ? `${path}?view=${encodeURIComponent(route.view)}` : path);
  const world = `/w/${seg(route.worldId, names.world)}`;
  if (route.scope === 'world') {
    if (route.tab === 'overview') return world;
    return withView(`${world}/${route.tab}${route.recordId ? `/${seg(route.recordId, names.record)}` : ''}`);
  }
  const base = `${world}/c/${seg(route.campaignId, names.campaign)}`;
  if (route.tab === 'overview' && !route.recordId) return base;
  const record = route.recordId ? `/${seg(route.recordId, names.record)}${route.sub ? `/${seg(route.sub, names.sub)}` : ''}` : '';
  return withView(`${base}/${route.tab}${record}`);
}
