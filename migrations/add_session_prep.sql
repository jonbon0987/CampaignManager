-- ============================================================
-- Add Session Prep table
-- ============================================================
-- Run this in the Supabase SQL editor after add_campaigns.sql.
-- ============================================================

create table if not exists public.session_prep (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  session_number  integer not null,
  prep_date       date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_id, session_number)
);

alter table public.session_prep enable row level security;

create policy "Users manage own session_prep"
  on public.session_prep for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists session_prep_campaign_id_idx on public.session_prep(campaign_id);
create index if not exists session_prep_user_id_idx     on public.session_prep(user_id);

create trigger session_prep_updated_at
  before update on public.session_prep
  for each row execute function public.set_updated_at();
