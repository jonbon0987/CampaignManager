// A campaign's player page: a read-only page at /p/<token> that the DM gives
// the table. The token is the only key, so it's long and random, and the DM
// can replace it (the old link stops working) or turn the page off.

import type { ShareKind } from './database.types';

const TOKEN_BYTES = 24; // 192 bits, 32 URL-safe characters

/** A fresh, unguessable link token. */
export function newPageToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function playerPageUrl(token: string, origin = window.location.origin): string {
  return `${origin}/p/${token}`;
}

/** The token in a player page's address, or null for any other address. */
export function playerPageToken(pathname: string): string | null {
  const m = /^\/p\/([A-Za-z0-9_-]{32,128})\/?$/.exec(pathname);
  return m ? m[1] : null;
}

/** How many of each kind the page shows, written for the DM: "2 recaps · 1 place". */
export function describeShared(counts: Partial<Record<ShareKind, number>>): string {
  const parts: [ShareKind, string, string][] = [
    ['session', 'recap', 'recaps'],
    ['handout', 'handout', 'handouts'],
    ['npc', 'person', 'people'],
    ['location', 'place', 'places'],
    ['lore', 'lore entry', 'lore entries'],
  ];
  return parts
    .filter(([k]) => (counts[k] ?? 0) > 0)
    .map(([k, one, many]) => `${counts[k]} ${counts[k] === 1 ? one : many}`)
    .join(' · ');
}
