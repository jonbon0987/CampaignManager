// What a campaign alone knows about an NPC: whether its party has met them, and
// how they feel about it. An NPC that belongs to one campaign keeps these on its
// own row. A canon NPC is shared between campaigns, so each campaign keeps them on
// its link (campaign_npcs) and the canon row's are never read. Pure.

export interface NpcDetails {
  met_by_pcs: boolean;
  disposition: string | null;
}

export const NO_NPC_DETAILS: NpcDetails = { met_by_pcs: false, disposition: null };

/** A link row's details. */
export const detailsOfLink = (link: { met_by_pcs?: boolean | null; disposition?: string | null }): NpcDetails => ({
  met_by_pcs: !!link.met_by_pcs,
  disposition: link.disposition ?? null,
});

/** The NPCs as this campaign sees them. A canon NPC with no details yet is one its party hasn't met. */
export function withCampaignDetails<T extends { id: string; campaign_id: string | null }>(
  npcs: T[],
  details: ReadonlyMap<string, NpcDetails>,
): (T & NpcDetails)[] {
  return npcs.map(n => (n.campaign_id === null ? { ...n, ...(details.get(n.id) ?? NO_NPC_DETAILS) } : n)) as (T & NpcDetails)[];
}

/** Splits a save into what goes on the link and what goes on the shared row. */
export function splitNpcDetails<T extends Partial<NpcDetails>>(npc: T, current: NpcDetails): { details: NpcDetails; shared: Omit<T, keyof NpcDetails> } {
  const { met_by_pcs, disposition, ...shared } = npc;
  return {
    details: {
      met_by_pcs: met_by_pcs ?? current.met_by_pcs,
      disposition: disposition === undefined ? current.disposition : disposition,
    },
    shared,
  };
}
