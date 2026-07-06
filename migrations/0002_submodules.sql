-- Migration: add submodules and module_sheets tables
-- Run this in your Supabase SQL editor (or via the CLI).

-- ----------------------------------------------------------------
-- submodules
-- Full-length write-ups belonging to a module (encounters, heists, etc.)
-- ----------------------------------------------------------------
create table if not exists public.submodules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  module_id   uuid not null references public.modules(id) on delete cascade,
  title       text not null,
  submodule_type text,        -- location | heist | event | social | travel | other
  summary     text,
  content     text,           -- full long-form write-up, no length limit
  dm_notes    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.submodules enable row level security;

create policy "Users manage own submodules"
  on public.submodules for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists submodules_module_id_idx on public.submodules(module_id);
create index if not exists submodules_user_id_idx   on public.submodules(user_id);

-- ----------------------------------------------------------------
-- scenes
-- Individual encounters, events, puzzles, etc. belonging to a submodule
-- ----------------------------------------------------------------
create table if not exists public.scenes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  submodule_id    uuid not null references public.submodules(id) on delete cascade,
  title           text not null,
  scene_type      text,           -- encounter | puzzle | social | trap | exploration | other
  summary         text,
  content         text,           -- full long-form write-up, no length limit
  dm_notes        text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.scenes enable row level security;

create policy "Users manage own scenes"
  on public.scenes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists scenes_submodule_id_idx on public.scenes(submodule_id);
create index if not exists scenes_user_id_idx      on public.scenes(user_id);

-- ----------------------------------------------------------------
-- module_sheets
-- Monster / NPC / PC / vehicle stat sheets belonging to a module
-- ----------------------------------------------------------------
create table if not exists public.module_sheets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  module_id   uuid not null references public.modules(id) on delete cascade,
  title       text not null,
  sheet_type  text,           -- monster | npc | pc | vehicle | other
  content     text,           -- full stat block or character sheet text
  dm_notes    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.module_sheets enable row level security;

create policy "Users manage own module_sheets"
  on public.module_sheets for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists module_sheets_module_id_idx on public.module_sheets(module_id);
create index if not exists module_sheets_user_id_idx   on public.module_sheets(user_id);

-- ----------------------------------------------------------------
-- optional: auto-update updated_at on both tables
-- (only needed if you haven't already added this trigger for other tables)
-- ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submodules_updated_at
  before update on public.submodules
  for each row execute function public.set_updated_at();

create trigger module_sheets_updated_at
  before update on public.module_sheets
  for each row execute function public.set_updated_at();

create trigger scenes_updated_at
  before update on public.scenes
  for each row execute function public.set_updated_at();
