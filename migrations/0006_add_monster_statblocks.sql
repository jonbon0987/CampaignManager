-- Migration: add monster_statblocks table and linked_monster_ids to submodules/scenes
-- Run this in your Supabase SQL editor (or via the CLI).

-- ----------------------------------------------------------------
-- monster_statblocks
-- Global monster/creature stat sheet library, not tied to any module.
-- ----------------------------------------------------------------
create table if not exists public.monster_statblocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  creature_type text,           -- beast | undead | humanoid | dragon | fiend | celestial | construct | elemental | fey | giant | monstrosity | ooze | plant | aberration | other
  challenge_rating text,        -- e.g., "1/4", "5", "17"
  content     text,             -- full stat block text
  dm_notes    text,
  tags        text,             -- comma-separated tags for filtering
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.monster_statblocks enable row level security;

create policy "Users manage own monster_statblocks"
  on public.monster_statblocks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists monster_statblocks_user_id_idx on public.monster_statblocks(user_id);

create trigger monster_statblocks_updated_at
  before update on public.monster_statblocks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------
-- Add linked_monster_ids to submodules and scenes
-- Stored as a JSON text array of monster_statblock UUIDs.
-- ----------------------------------------------------------------
alter table public.submodules
  add column if not exists linked_monster_ids text default '[]';

alter table public.scenes
  add column if not exists linked_monster_ids text default '[]';
