// src/hooks/useChronicleWriter.ts
// -----------------------------------------------------------
// The ChronicleWriter (src/lib/recording/applyChronicle.ts) for the live
// campaign: it writes through CampaignContext so every screen updates at once,
// and through the same column whitelist and merge rules as the assistant.
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { ChronicleAppliedLog, ChronicleProposals, EntitySessionEntries } from '../lib/db';
import { normalizeAssistantPayload } from '../lib/assistantNormalize';
import type { ChronicleWriter } from '../lib/recording/applyChronicle';
import type { EntityKind } from '../lib/recording/chronicle';

type Kind = EntityKind | 'session';

const ACTION_TYPE: Record<Kind, string> = {
  session: 'upsertSession', pc: 'upsertPC', npc: 'upsertNPC', location: 'upsertLocation',
  faction: 'upsertFaction', lore: 'upsertLore', hook: 'upsertHook',
};

const SERVER_FIELDS = new Set(['user_id', 'created_at', 'updated_at']);
const stripServer = (r: object) => Object.fromEntries(Object.entries(r).filter(([k]) => !SERVER_FIELDS.has(k)));

export type FullChronicleWriter = ChronicleWriter & { markUndone: (id: string) => Promise<void> };

export function useChronicleWriter(ctx: { recordingId: string; sessionId: string } | null): FullChronicleWriter | null {
  const campaign = useCampaign();

  return useMemo(() => {
    if (!ctx || !campaign.selectedCampaignId) return null;
    const campaignId = campaign.selectedCampaignId;
    const lists: Record<Kind, { id: string }[]> = {
      session: campaign.sessions, pc: campaign.pcs, npc: campaign.npcs, location: campaign.locations,
      faction: campaign.factions, lore: campaign.lore, hook: campaign.hooks,
    };

    // What this writer has written, so a second change to the same entity in one
    // apply builds on the first instead of on the campaign as it was before.
    const written = new Map<string, Record<string, unknown>>();

    const write: ChronicleWriter['write'] = async (kind, payload, before) => {
      // campaign_id is set by the write path from the scope; a canon entry
      // (campaign_id null, linked into this campaign) is written back to canon.
      const { campaign_id: _drop, ...fields } = normalizeAssistantPayload(ACTION_TYPE[kind], stripServer(payload)) as Record<string, unknown>;
      void _drop;
      const scope = before && before.campaign_id === null ? 'global' : 'campaign';
      type Arg<F extends (...a: never[]) => unknown> = Parameters<F>[0];
      let saved: { id: string } | undefined;
      switch (kind) {
        case 'session': saved = await campaign.upsertSession(fields as Arg<typeof campaign.upsertSession>); break;
        case 'pc': saved = await campaign.upsertPC(fields as Arg<typeof campaign.upsertPC>); break;
        case 'npc': saved = await campaign.upsertNPC(fields as Arg<typeof campaign.upsertNPC>, scope); break;
        case 'location': saved = await campaign.upsertLocation(fields as Arg<typeof campaign.upsertLocation>, scope); break;
        case 'faction': saved = await campaign.upsertFaction(fields as Arg<typeof campaign.upsertFaction>); break;
        case 'lore': saved = await campaign.upsertLore(fields as Arg<typeof campaign.upsertLore>, scope); break;
        case 'hook': saved = await campaign.upsertHook(fields as Arg<typeof campaign.upsertHook>); break;
      }
      if (!saved?.id) throw new Error('The campaign didn’t save that change.');
      written.set(saved.id, { ...(before ?? {}), ...fields, id: saved.id, campaign_id: before ? before.campaign_id : campaignId });
      return saved.id;
    };

    const writer: FullChronicleWriter = {
      existing: (kind, id) => {
        if (written.has(id)) return { ...written.get(id)! };
        const row = lists[kind].find(r => r.id === id);
        return row ? stripServer(row) : null;
      },
      write,
      remove: async (kind, id) => {
        written.delete(id);
        switch (kind) {
          case 'npc': return campaign.deleteNPC(id);
          case 'location': return campaign.deleteLocation(id);
          case 'faction': return campaign.deleteFaction(id);
          case 'lore': return campaign.deleteLore(id);
          case 'hook': return campaign.deleteHook(id);
          case 'pc': return campaign.deletePC(id);
        }
      },
      addEntry: async e => (await EntitySessionEntries.upsert({
        campaign_id: campaignId, session_id: ctx.sessionId, recording_id: ctx.recordingId, ...e,
      })).id,
      removeEntry: id => EntitySessionEntries.delete(id),
      logApplied: async r => { await ChronicleAppliedLog.record({ recording_id: ctx.recordingId, ...r }); },
      setStatus: async (id, status) => { await ChronicleProposals.update(id, { status }); },
      markUndone: async id => { await ChronicleAppliedLog.markUndone(id); },
    };
    return writer;
  }, [ctx, campaign]);
}
