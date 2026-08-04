-- ============================================================
-- Join table for linking global (canon) lore entries to campaigns
-- ============================================================
-- Mirrors campaign_locations / campaign_npcs (see 0007_add_campaigns.sql).
-- A campaign "imports" a canon lore entry (campaign_id IS NULL, world-scoped)
-- by adding a row here; the merged campaign view = campaign-local lore +
-- linked canon lore. Detaching removes the row; canon is untouched.
-- ============================================================

create table if not exists public.campaign_lore (
  campaign_id uuid not null references public.campaigns(id)     on delete cascade,
  lore_id     uuid not null references public.lore_entries(id)  on delete cascade,
  user_id     uuid not null references auth.users(id)           on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, lore_id)
);

alter table public.campaign_lore enable row level security;

drop policy if exists "Users manage own campaign_lore" on public.campaign_lore;
create policy "Users manage own campaign_lore"
  on public.campaign_lore for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists campaign_lore_campaign_id_idx on public.campaign_lore(campaign_id);
create index if not exists campaign_lore_lore_id_idx     on public.campaign_lore(lore_id);
