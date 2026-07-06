-- Migration: add scenes table and update submodules
-- Run this in your Supabase SQL editor if submodules/module_sheets already exist.

-- ----------------------------------------------------------------
-- submodules: update submodule_type comment (no schema change needed)
-- If you previously had parent_submodule_id from an earlier draft, drop it:
-- ----------------------------------------------------------------
alter table public.submodules
  drop column if exists parent_submodule_id;

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
-- auto-update updated_at for scenes
-- (set_updated_at function already exists from the first migration)
-- ----------------------------------------------------------------
create trigger scenes_updated_at
  before update on public.scenes
  for each row execute function public.set_updated_at();
