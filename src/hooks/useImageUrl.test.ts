import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const signedUrls = vi.hoisted(() => vi.fn(async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`]))));
vi.mock('../lib/db', () => ({ EntityImages: { signedUrls } }));

import { useImageUrl } from './useImageUrl';

describe('useImageUrl', () => {
  it('fetches the links asked for at the same moment in one request, then serves them from the cache', async () => {
    const { result } = renderHook(() => [useImageUrl('u/a.webp'), useImageUrl('u/b.webp')]);
    expect(result.current).toEqual([null, null]);
    await waitFor(() => expect(result.current).toEqual(['https://signed/u/a.webp', 'https://signed/u/b.webp']));
    expect(signedUrls).toHaveBeenCalledTimes(1);
    expect(signedUrls).toHaveBeenCalledWith(['u/a.webp', 'u/b.webp'], 3600);

    // Another picture showing the same image needs no new link.
    const again = renderHook(() => useImageUrl('u/a.webp'));
    expect(again.result.current).toBe('https://signed/u/a.webp');
    expect(signedUrls).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when there is no picture', () => {
    signedUrls.mockClear();
    const { result } = renderHook(() => useImageUrl(null));
    expect(result.current).toBeNull();
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it('stays empty when the link cannot be fetched', async () => {
    signedUrls.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useImageUrl('u/c.webp'));
    await waitFor(() => expect(signedUrls).toHaveBeenCalledWith(['u/c.webp'], 3600));
    expect(result.current).toBeNull();
  });
});
