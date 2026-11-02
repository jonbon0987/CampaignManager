// A stored image's signed URL. The bucket is private, so each picture is shown
// through a link that lasts an hour; links are cached for the session and
// requests made in the same moment are fetched together.

import { useEffect, useReducer } from 'react';
import { EntityImages } from '../lib/db';

const LINK_SECONDS = 3600;
const REFRESH_EARLY_MS = 5 * 60_000;

const cache = new Map<string, { url: string; expires: number }>();
let queued = new Set<string>();
let batch: Promise<void> | null = null;

function fresh(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

/** Fetches links for every path asked for in this tick, in one request. */
function request(path: string): Promise<void> {
  queued.add(path);
  if (!batch) {
    batch = Promise.resolve().then(async () => {
      const paths = [...queued];
      queued = new Set();
      batch = null;
      const urls = await EntityImages.signedUrls(paths, LINK_SECONDS);
      const expires = Date.now() + LINK_SECONDS * 1000 - REFRESH_EARLY_MS;
      urls.forEach((url, p) => cache.set(p, { url, expires }));
    });
  }
  return batch;
}

export function useImageUrl(path: string | null | undefined): string | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const url = path ? fresh(path) : null;

  useEffect(() => {
    if (!path || url) return;
    let live = true;
    request(path).then(() => { if (live) rerender(); }).catch(() => {});
    return () => { live = false; };
  }, [path, url]);

  return url;
}
