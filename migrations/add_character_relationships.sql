-- Migration: add character_relationships table
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists character_relationships (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  from_id           uuid not null,
  from_kind         text not null check (from_kind in ('pc', 'npc')),
  to_id             uuid not null,
  to_kind           text not null check (to_kind in ('pc', 'npc')),
  relationship_type text not null check (relationship_type in ('ally', 'rival', 'foe', 'neutral')),
  label             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- prevent exact duplicate directed edges for the same user
  unique (user_id, from_id, to_id)
);

-- Row-level security: users can only see and modify their own rows.
alter table character_relationships enable row level security;

create policy "Users manage their own relationships"
  on character_relationships
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at current automatically.
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_character_relationships_updated_at
  before update on character_relationships
  for each row execute procedure update_updated_at_column();
