-- ============================================================
-- IA restructure: location tree + Threads lifecycle + Ideas inbox
-- ============================================================
-- 1. locations.parent_id — self-referential nesting (region › city › site)
-- 2. hooks.state        — thread lifecycle (seed | active | cold | resolved)
-- 3. ideas              — raw inbox notes that promote into a hook (thread)
-- Idempotent; safe to run more than once (SQL editor or migrate runner).
-- ============================================================

-- 1. Location hierarchy -------------------------------------------------
alter table public.locations
  add column if not exists parent_id uuid references public.locations(id) on delete set null;

create index if not exists locations_parent_id_idx on public.locations(parent_id);

-- 2. Thread lifecycle on hooks -----------------------------------------
alter table public.hooks
  add column if not exists state text;

-- Backfill: existing active hooks become 'active', resolved become 'resolved'.
update public.hooks
set state = case when is_active then 'active' else 'resolved' end
where state is null;

-- 3. Ideas inbox --------------------------------------------------------
create table if not exists public.ideas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id)       on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  text              text not null default '',
  tag               text,
  promoted_hook_id  uuid references public.hooks(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.ideas enable row level security;

drop policy if exists "Users manage own ideas" on public.ideas;
create policy "Users manage own ideas"
  on public.ideas for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists ideas_campaign_id_idx on public.ideas(campaign_id);

-- reuse the shared set_updated_at trigger (defined for other tables)
drop trigger if exists ideas_updated_at on public.ideas;
create trigger ideas_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();
