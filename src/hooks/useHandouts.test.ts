import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Handout } from '../lib/database.types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
  getByScenes: vi.fn(),
  upsert: vi.fn(),
  del: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('../context/CampaignContext', () => ({ useCampaign: () => ({ selectedCampaignId: 'c1' }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../lib/db', () => ({ Handouts: { getByScenes: h.getByScenes, upsert: h.upsert, delete: h.del } }));
vi.mock('../lib/images', () => ({ uploadImage: h.upload }));

import { useHandouts } from './useHandouts';

const letter: Handout = {
  id: 'h1', user_id: 'u', campaign_id: 'c1', scene_id: 's1', title: 'Letter', image_path: 'u/h1.webp',
  sort_order: 1, created_at: '', updated_at: '',
};

async function loaded(sceneIds = ['s1']) {
  const hook = renderHook(() => useHandouts(sceneIds));
  await waitFor(() => expect(hook.result.current.handouts).not.toBeNull());
  return hook;
}

describe('useHandouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getByScenes.mockResolvedValue([letter]);
    h.upload.mockImplementation(async (f: File) => `u/${f.name}`);
    h.upsert.mockImplementation(async (x: Partial<Handout>) => ({ ...letter, id: `new-${x.title}`, ...x }));
    h.del.mockResolvedValue(undefined);
    h.confirm.mockResolvedValue(true);
  });

  it('loads the handouts on the scenes asked for', async () => {
    const { result } = await loaded(['s1', 's2']);
    expect(h.getByScenes).toHaveBeenCalledWith(['s1', 's2']);
    expect(result.current.handouts).toEqual([letter]);
  });

  it('uploads each file and titles it from the file name', async () => {
    const { result } = await loaded();
    const files = [new File(['a'], 'crypt-map_v2.png', { type: 'image/png' }), new File(['b'], 'seal.jpg', { type: 'image/jpeg' })];
    await act(() => result.current.add('s1', files));
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: 'c1', scene_id: 's1', title: 'crypt map v2', image_path: 'u/crypt-map_v2.png' }));
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'seal', image_path: 'u/seal.jpg' }));
    expect(result.current.handouts?.map(x => x.title)).toEqual(['Letter', 'crypt map v2', 'seal']);
    expect(result.current.adding).toBe(false);
  });

  it('says so when an upload fails', async () => {
    h.upload.mockRejectedValue(new Error('Too big'));
    const { result } = await loaded();
    await act(() => result.current.add('s1', [new File(['a'], 'a.png', { type: 'image/png' })]));
    expect(h.toast).toHaveBeenCalledWith('Too big', 'error');
    expect(result.current.handouts).toEqual([letter]);
    expect(result.current.adding).toBe(false);
  });

  it('renames in place, and only when the title changed', async () => {
    const { result } = await loaded();
    await act(() => result.current.rename(letter, 'Letter'));
    expect(h.upsert).not.toHaveBeenCalled();
    await act(() => result.current.rename(letter, 'The ransom letter'));
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', title: 'The ransom letter', image_path: 'u/h1.webp' }));
    expect(result.current.handouts?.[0].title).toBe('The ransom letter');
  });

  it('removes a handout once confirmed, and puts it back if the delete fails', async () => {
    const { result } = await loaded();
    h.confirm.mockResolvedValueOnce(false);
    await act(() => result.current.remove(letter));
    expect(h.del).not.toHaveBeenCalled();
    expect(result.current.handouts).toEqual([letter]);

    await act(() => result.current.remove(letter));
    expect(h.confirm).toHaveBeenCalledWith(expect.stringMatching(/Remove “Letter”\?/));
    expect(h.del).toHaveBeenCalledWith(letter);
    expect(result.current.handouts).toEqual([]);

    h.getByScenes.mockResolvedValue([letter]);
    h.del.mockRejectedValue(new Error('Offline'));
    const again = await loaded(['s9']);
    await act(() => again.result.current.remove(letter));
    expect(h.toast).toHaveBeenCalledWith('Offline', 'error');
    expect(again.result.current.handouts).toEqual([letter]);
  });
});
