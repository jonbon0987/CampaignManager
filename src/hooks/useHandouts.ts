// The handouts kept on a set of scenes: loaded together, and added to,
// renamed or removed in place.

import { useCallback, useEffect, useState } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Handouts } from '../lib/db';
import { uploadImage } from '../lib/images';
import type { Handout } from '../lib/database.types';

const titleFrom = (file: File) => file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useHandouts(sceneIds: string[]) {
  const { selectedCampaignId } = useCampaign();
  const toast = useToast();
  const confirm = useConfirm();
  const key = sceneIds.join(',');
  const [handouts, setHandouts] = useState<Handout[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    Handouts.getByScenes(key ? key.split(',') : [])
      .then(h => { if (live) setHandouts(h); })
      .catch(() => { if (live) setHandouts([]); });
    return () => { live = false; };
  }, [key]);

  const add = useCallback(async (sceneId: string, files: File[]) => {
    if (!selectedCampaignId || files.length === 0) return;
    setAdding(true);
    try {
      for (const file of files) {
        const image_path = await uploadImage(file);
        const saved = await Handouts.upsert({ campaign_id: selectedCampaignId, scene_id: sceneId, title: titleFrom(file), image_path, sort_order: Date.now() % 2_000_000_000 });
        setHandouts(prev => [...(prev ?? []), saved]);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setAdding(false);
    }
  }, [selectedCampaignId, toast]);

  const rename = useCallback(async (h: Handout, title: string) => {
    if (title === h.title) return;
    setHandouts(prev => prev?.map(x => (x.id === h.id ? { ...x, title } : x)) ?? prev);
    try {
      await Handouts.upsert({ id: h.id, campaign_id: h.campaign_id, scene_id: h.scene_id, title, image_path: h.image_path, sort_order: h.sort_order });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [toast]);

  const remove = useCallback(async (h: Handout) => {
    if (!(await confirm(`Remove “${h.title || 'this handout'}”? The picture is deleted.`))) return;
    setHandouts(prev => prev?.filter(x => x.id !== h.id) ?? prev);
    try {
      await Handouts.delete(h);
    } catch (e) {
      toast(errorMessage(e), 'error');
      setHandouts(prev => [...(prev ?? []), h]);
    }
  }, [confirm, toast]);

  return { handouts, adding, add, rename, remove };
}
