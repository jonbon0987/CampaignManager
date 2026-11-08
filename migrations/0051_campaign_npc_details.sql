-- ============================================================
-- Each campaign's own view of a canon NPC (audit II, SW5)
-- ============================================================
-- Whether the party has met an NPC, and how that NPC feels about them, belong to
-- the table, not the world. A canon NPC linked into two campaigns used to share
-- both, so meeting them in one marked them as met in the other. They now live on
-- the link:
--
--   campaign_npcs.met_by_pcs    Has this campaign's party met them?
--   campaign_npcs.disposition   Their attitude toward this campaign's party.
--
-- An NPC that belongs to one campaign keeps both on its own row in npcs.
--
-- Each link starts with what the NPC showed before, so nothing a campaign can see
-- changes. The old values stay on the canon rows, unread, and nothing is deleted.
--
-- met_by_pcs is nullable so that a link deleted before this migration can still be
-- restored from Recently deleted: restoring fills columns from a saved copy of the
-- row, and that copy doesn't have this one. The app reads null as not met.
-- ============================================================

alter table public.campaign_npcs add column if not exists met_by_pcs boolean default false;
alter table public.campaign_npcs add column if not exists disposition text;

alter table public.campaign_npcs drop constraint if exists campaign_npcs_disposition_len_chk;
alter table public.campaign_npcs add constraint campaign_npcs_disposition_len_chk
  check (char_length(disposition) <= 120) not valid;

update public.campaign_npcs cn
   set met_by_pcs = coalesce(n.met_by_pcs, false),
       disposition = n.disposition
  from public.npcs n
 where n.id = cn.npc_id;
