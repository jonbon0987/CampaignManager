-- ============================================================
-- Add Random Encounter Tables
-- ============================================================
-- Roll-table style random encounters. Like `encounters`, a table lives at
-- EITHER the world level (world_id set, campaign_id null — a reusable template)
-- OR the campaign level (campaign_id set). World tables can be imported into a
-- campaign as an independent copy.
--
-- Run this in the Supabase SQL editor after add_encounters.sql / world_encounters.sql.
-- ============================================================

create table if not exists public.random_encounter_tables (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid references public.campaigns(id) on delete cascade,
  world_id     uuid references public.worlds(id)    on delete cascade,
  name         text not null,
  environment  text,          -- terrain / biome: forest | dungeon | urban | coast | etc.
  die_size     integer not null default 20,   -- d20 / d100 / d12 …
  description  text,
  entries      jsonb not null default '[]'::jsonb,  -- RandomEncounterEntry[] (see database.types.ts)
  dm_notes     text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.random_encounter_tables enable row level security;

create policy "Users manage own random encounter tables"
  on public.random_encounter_tables for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists random_encounter_tables_campaign_id_idx on public.random_encounter_tables(campaign_id);
create index if not exists random_encounter_tables_world_id_idx    on public.random_encounter_tables(world_id);
create index if not exists random_encounter_tables_user_id_idx     on public.random_encounter_tables(user_id);

create trigger random_encounter_tables_updated_at
  before update on public.random_encounter_tables
  for each row execute function public.set_updated_at();

-- Field-length / range CHECK constraints (mirrors src/lib/fieldLimits.ts).
-- Folded in here rather than regenerating 0028 (which is already applied).
alter table public.random_encounter_tables add constraint random_encounter_tables_name_len_chk        check (char_length(name) <= 120)       not valid;
alter table public.random_encounter_tables add constraint random_encounter_tables_environment_len_chk check (char_length(environment) <= 60) not valid;
alter table public.random_encounter_tables add constraint random_encounter_tables_description_len_chk  check (char_length(description) <= 8000) not valid;
alter table public.random_encounter_tables add constraint random_encounter_tables_dm_notes_len_chk     check (char_length(dm_notes) <= 8000)   not valid;
alter table public.random_encounter_tables add constraint random_encounter_tables_die_size_range_chk   check (die_size between 2 and 1000)     not valid;
