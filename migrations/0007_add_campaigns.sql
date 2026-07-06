-- ============================================================
-- Add multi-campaign support
-- ============================================================
-- Run this entire script in the Supabase SQL editor.
-- It is safe to run on an existing database — existing data
-- will be migrated to a "Default Campaign" automatically.
-- ============================================================

-- ============================================================
-- 1. Create the campaigns table
-- ============================================================

create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  description      text,
  -- Overview fields (moved here from localStorage)
  title            text,
  plot_summary     text,
  major_characters text,
  world_info       text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "Users manage own campaigns"
  on public.campaigns for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists campaigns_user_id_idx on public.campaigns(user_id);

-- Re-use existing set_updated_at trigger function (already defined for other tables)
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Seed a "Default Campaign" for every user who has data
-- ============================================================

insert into public.campaigns (user_id, name, sort_order)
select distinct user_id, 'Default Campaign', 0
from (
  select user_id from public.sessions
  union
  select user_id from public.player_characters
  union
  select user_id from public.modules
  union
  select user_id from public.hooks
  union
  select user_id from public.factions
  union
  select user_id from public.npcs
  union
  select user_id from public.locations
) all_users
on conflict do nothing;

-- ============================================================
-- 3. Add campaign_id (nullable initially) to campaign-scoped tables
-- ============================================================

alter table public.sessions
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.player_characters
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.modules
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.hooks
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.factions
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.character_relationships
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.monster_statblocks
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

-- ============================================================
-- 4. Backfill campaign_id using the Default Campaign
-- ============================================================

update public.sessions s
set campaign_id = c.id
from public.campaigns c
where c.user_id = s.user_id
  and c.name = 'Default Campaign'
  and s.campaign_id is null;

update public.player_characters pc
set campaign_id = c.id
from public.campaigns c
where c.user_id = pc.user_id
  and c.name = 'Default Campaign'
  and pc.campaign_id is null;

update public.modules m
set campaign_id = c.id
from public.campaigns c
where c.user_id = m.user_id
  and c.name = 'Default Campaign'
  and m.campaign_id is null;

update public.hooks h
set campaign_id = c.id
from public.campaigns c
where c.user_id = h.user_id
  and c.name = 'Default Campaign'
  and h.campaign_id is null;

update public.factions f
set campaign_id = c.id
from public.campaigns c
where c.user_id = f.user_id
  and c.name = 'Default Campaign'
  and f.campaign_id is null;

update public.character_relationships cr
set campaign_id = c.id
from public.campaigns c
where c.user_id = cr.user_id
  and c.name = 'Default Campaign'
  and cr.campaign_id is null;

update public.monster_statblocks ms
set campaign_id = c.id
from public.campaigns c
where c.user_id = ms.user_id
  and c.name = 'Default Campaign'
  and ms.campaign_id is null;

-- ============================================================
-- 5. Make campaign_id NOT NULL on campaign-scoped tables
-- ============================================================

alter table public.sessions alter column campaign_id set not null;
alter table public.player_characters alter column campaign_id set not null;
alter table public.modules alter column campaign_id set not null;
alter table public.hooks alter column campaign_id set not null;
alter table public.factions alter column campaign_id set not null;
alter table public.character_relationships alter column campaign_id set not null;
alter table public.monster_statblocks alter column campaign_id set not null;

-- ============================================================
-- 6. Fix sessions unique constraint (was per-user, now per-campaign)
-- ============================================================

alter table public.sessions
  drop constraint if exists sessions_user_id_session_number_key;

alter table public.sessions
  add constraint sessions_campaign_id_session_number_key
  unique (campaign_id, session_number);

-- ============================================================
-- 7. Add nullable campaign_id to NPCs and Locations
--    NULL = global (world-level), non-null = campaign-specific
--    Existing rows are backfilled to the Default Campaign
-- ============================================================

alter table public.npcs
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.locations
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

-- Backfill existing NPCs and Locations to the Default Campaign
update public.npcs n
set campaign_id = c.id
from public.campaigns c
where c.user_id = n.user_id
  and c.name = 'Default Campaign'
  and n.campaign_id is null;

update public.locations l
set campaign_id = c.id
from public.campaigns c
where c.user_id = l.user_id
  and c.name = 'Default Campaign'
  and l.campaign_id is null;

-- ============================================================
-- 8. Performance indexes
-- ============================================================

create index if not exists sessions_campaign_id_idx              on public.sessions(campaign_id);
create index if not exists player_characters_campaign_id_idx     on public.player_characters(campaign_id);
create index if not exists modules_campaign_id_idx               on public.modules(campaign_id);
create index if not exists hooks_campaign_id_idx                 on public.hooks(campaign_id);
create index if not exists factions_campaign_id_idx              on public.factions(campaign_id);
create index if not exists character_relationships_cid_idx       on public.character_relationships(campaign_id);
create index if not exists monster_statblocks_campaign_id_idx    on public.monster_statblocks(campaign_id);
create index if not exists npcs_campaign_id_idx                  on public.npcs(campaign_id);
create index if not exists locations_campaign_id_idx             on public.locations(campaign_id);

-- ============================================================
-- 9. Join tables for linking global NPCs/Locations to campaigns
-- ============================================================

create table if not exists public.campaign_npcs (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  npc_id      uuid not null references public.npcs(id)      on delete cascade,
  user_id     uuid not null references auth.users(id)        on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, npc_id)
);

alter table public.campaign_npcs enable row level security;

create policy "Users manage own campaign_npcs"
  on public.campaign_npcs for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists campaign_npcs_campaign_id_idx on public.campaign_npcs(campaign_id);
create index if not exists campaign_npcs_npc_id_idx      on public.campaign_npcs(npc_id);

create table if not exists public.campaign_locations (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id)  on delete cascade,
  user_id     uuid not null references auth.users(id)         on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, location_id)
);

alter table public.campaign_locations enable row level security;

create policy "Users manage own campaign_locations"
  on public.campaign_locations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists campaign_locations_campaign_id_idx  on public.campaign_locations(campaign_id);
create index if not exists campaign_locations_location_id_idx  on public.campaign_locations(location_id);
