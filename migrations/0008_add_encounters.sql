-- ============================================================
-- Add Encounter Builder table
-- ============================================================
-- Run this in the Supabase SQL editor after add_campaigns.sql.
-- ============================================================

create table if not exists public.encounters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  name         text not null,
  description  text,
  environment  text,          -- dungeon | forest | urban | cave | open | other
  difficulty   text,          -- easy | medium | hard | deadly
  party_size   integer,
  party_level  integer,
  combatants   jsonb,         -- EncounterCombatant[] (see database.types.ts)
  dm_notes     text,
  status       text not null default 'draft', -- draft | ready | completed
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.encounters enable row level security;

create policy "Users manage own encounters"
  on public.encounters for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists encounters_campaign_id_idx on public.encounters(campaign_id);
create index if not exists encounters_user_id_idx     on public.encounters(user_id);

create trigger encounters_updated_at
  before update on public.encounters
  for each row execute function public.set_updated_at();
