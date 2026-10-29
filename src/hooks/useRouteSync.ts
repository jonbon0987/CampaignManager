import { useEffect, useRef } from 'react';
import { buildPath, parseRoute, type Route } from '../lib/route';

/** True when two routes show the same tab of the same world or campaign. */
function sameTab(a: Route, b: Route): boolean {
  if (a.scope !== b.scope || a.worldId !== b.worldId || a.tab !== b.tab) return false;
  return a.scope === 'world' || (b.scope === 'campaign' && a.campaignId === b.campaignId);
}

/**
 * Keeps the URL in step with what's on screen, and what's on screen in step
 * with Back and Forward.
 *
 * `route` is where the app is now; when it changes, the URL follows. Moving to
 * another tab, world, campaign or record adds a history entry. A record being
 * picked for the first time (a tab's default selection) or a view switch only
 * replaces the current one, so Back isn't cluttered. `apply` is called with
 * the route Back or Forward lands on.
 */
export function useRouteSync(route: Route | null, apply: (route: Route) => void) {
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  const last = useRef<Route | null>(null);
  const path = route ? buildPath(route) : null;

  useEffect(() => {
    if (!route || !path) return;
    const here = window.location.pathname + window.location.search;
    // A shell that has just mounted (after a switch between world and
    // campaign) compares with the address it found, so the switch gets its own
    // history entry. Only a fresh load at "/" is replaced.
    const prev = last.current ?? parseRoute(window.location.pathname, window.location.search);
    last.current = route;
    if (path === here) return;
    const minor = !prev || (sameTab(prev, route) && (
      !prev.recordId || !route.recordId ||
      (prev.scope === 'campaign' && route.scope === 'campaign' && prev.recordId === route.recordId && prev.view !== route.view)
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

/** The route in the address bar right now, or null for "/". */
export const currentRoute = () => parseRoute(window.location.pathname, window.location.search);
