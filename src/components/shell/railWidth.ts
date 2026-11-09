// How wide the docked rail may be. Pure.

export const RAIL_DEFAULT = 340;
export const RAIL_MIN = 300;
const RAIL_CAP = 760;
/** What the page beside it keeps, at the least, with the sidebar open: enough for a list and its detail. */
const MAIN_MIN = 640;
const SIDEBAR = 260;

/** The widest the rail can be in a window this wide, leaving room for the page. */
export const railMax = (viewport: number) => Math.max(RAIL_MIN, Math.min(RAIL_CAP, viewport - SIDEBAR - MAIN_MIN));

/** A width the rail can take: whole pixels, within its limits. Anything unreadable is the default. */
export function clampRail(width: unknown, viewport: number): number {
  const n = typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : RAIL_DEFAULT;
  return Math.min(railMax(viewport), Math.max(RAIL_MIN, n));
}
