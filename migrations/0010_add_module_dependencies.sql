-- ============================================================
-- Add Module Dependencies and Submodule Dependencies tables
-- ============================================================
-- Run this in the Supabase SQL editor after supabase_migration_submodules.sql.
-- Requires modules and submodules tables to exist.
-- ============================================================

-- ----------------------------------------------------------------
-- module_dependencies
-- Directed prerequisite edges between modules.
-- dependent_id "depends on" prerequisite_id.
-- dependency_type: 'required' (AND) or 'optional' (OR group).
-- group_id: NULL for 'required' rows; shared UUID for 'optional'
--           rows that belong to the same OR group.
-- ----------------------------------------------------------------
create table if not exists public.module_dependencies (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  dependent_id     uuid not null references public.modules(id) on delete cascade,
  prerequisite_id  uuid not null references public.modules(id) on delete cascade,
  dependency_type  text not null default 'required'
                     check (dependency_type in ('required', 'optional')),
  group_id         uuid,
  label            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, dependent_id, prerequisite_id),
  check (dependent_id <> prerequisite_id)
);

alter table public.module_dependencies enable row level security;

create policy "Users manage own module_dependencies"
  on public.module_dependencies for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists module_deps_campaign_id_idx     on public.module_dependencies(campaign_id);
create index if not exists module_deps_dependent_id_idx    on public.module_dependencies(dependent_id);
create index if not exists module_deps_prerequisite_id_idx on public.module_dependencies(prerequisite_id);
create index if not exists module_deps_user_id_idx         on public.module_dependencies(user_id);

create trigger module_dependencies_updated_at
  before update on public.module_dependencies
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------
-- submodule_dependencies
-- Same pattern as module_dependencies, but for submodules.
-- No campaign_id — scope is implicit via submodule → module → campaign.
-- ----------------------------------------------------------------
create table if not exists public.submodule_dependencies (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  dependent_id     uuid not null references public.submodules(id) on delete cascade,
  prerequisite_id  uuid not null references public.submodules(id) on delete cascade,
  dependency_type  text not null default 'required'
                     check (dependency_type in ('required', 'optional')),
  group_id         uuid,
  label            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, dependent_id, prerequisite_id),
  check (dependent_id <> prerequisite_id)
);

alter table public.submodule_dependencies enable row level security;

create policy "Users manage own submodule_dependencies"
  on public.submodule_dependencies for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists submodule_deps_dependent_id_idx    on public.submodule_dependencies(dependent_id);
create index if not exists submodule_deps_prerequisite_id_idx on public.submodule_dependencies(prerequisite_id);
create index if not exists submodule_deps_user_id_idx         on public.submodule_dependencies(user_id);

create trigger submodule_dependencies_updated_at
  before update on public.submodule_dependencies
  for each row execute function public.set_updated_at();
