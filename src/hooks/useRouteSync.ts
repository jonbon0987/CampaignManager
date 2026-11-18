import { useEffect, useRef } from 'react';
import { buildPath, parseRoute, sameRef, type Route, type RouteNames } from '../lib/route';

/** True when two routes show the same tab of the same world or campaign. */
function sameTab(a: Route, b: Route): boolean {
  if (a.scope !== b.scope || !sameRef(a.worldId, b.worldId) || a.tab !== b.tab) return false;
  return a.scope === 'world' || (b.scope === 'campaign' && sameRef(a.campaignId, b.campaignId));
}

/**
 * Keeps the URL in step with what's on screen, and what's on screen in step
 * with Back and Forward.
 *
 * `route` is where the app is now; when it changes, the URL follows. Moving to
 * another tab, world, campaign or record adds a history entry. A record being
 * picked for the first time (a tab's default selection) or a view switch only
 * replaces the current one, so Back isn't cluttered, and so does a rename
 * (only the name in the address changes). `apply` is called with the route
 * Back or Forward lands on; its ids may be short references (see resolveRef).
 * `names` are shown beside the ids.
 */
export function useRouteSync(route: Route | null, apply: (route: Route) => void, names?: RouteNames) {
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  const last = useRef<Route | null>(null);
  const path = route ? buildPath(route, names) : null;

  useEffect(() => {
    if (!route || !path) return;
    const here = window.location.pathname + window.location.search;
    // A shell that has just mounted (after a switch between world and
    // campaign) compares with the address it found, so the switch gets its own
    // history entry. Only a fresh load at "/" is replaced.
    const prev = last.current ?? parseRoute(window.location.pathname, window.location.search);
    last.current = route;
    if (path === here) return;
    const sameRecord = !!prev && sameRef(prev.recordId, route.recordId);
    const subOf = (r: Route) => (r.scope === 'campaign' ? r.sub : undefined);
    const minor = !prev || (sameTab(prev, route) && (
      !prev.recordId || !route.recordId ||
      (sameRecord && (prev.view !== route.view || sameRef(subOf(prev), subOf(route))))
    ));
    const url = path + window.location.hash;
    if (minor) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState(null, '', url);
  // `path` captures everything about `route` that reaches the URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const onPop = () => {
      const r = parseRoute(window.location.pathname, window.location.search);
      if (!r) return;
      last.current = r;
      applyRef.current(r);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

/** The route in the address bar right now, or null for "/". Its ids may be short references. */
export const currentRoute = () => parseRoute(window.location.pathname, window.location.search);
