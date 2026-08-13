-- 0027_enable_rls_core_entities.sql
-- ---------------------------------------------------------------------------
-- Guarantee Row-Level Security on the core entity tables.
--
-- WHY: the app talks to Supabase with the ANON key (src/lib/supabase.ts), so
-- Row-Level Security is the ONLY thing preventing one authenticated user from
-- reading another user's rows. Client-side filters (.eq('world_id', …)) are for
-- correctness, NOT security — any signed-in user can issue their own queries.
--
-- These tables were created in the initial schema (before migration 0001), so
-- unlike worlds/campaigns/etc. their RLS was never asserted in version control.
-- This migration makes the owner-only guarantee explicit for every one of them.
--
-- SAFE TO RE-RUN: enabling RLS is idempotent, and each policy is dropped-if-exists
-- before being (re)created. If a table already had correct RLS, this is a no-op.
--
-- NOTE: after this runs, only rows whose user_id = auth.uid() are visible. If any
-- legacy rows have a NULL user_id they'll become invisible — check first with:
--   select 'npcs' t, count(*) from public.npcs where user_id is null
--   union all select 'locations', count(*) from public.locations where user_id is null
--   union all select 'lore_entries', count(*) from public.lore_entries where user_id is null
--   union all select 'factions', count(*) from public.factions where user_id is null
--   union all select 'hooks', count(*) from public.hooks where user_id is null
--   union all select 'sessions', count(*) from public.sessions where user_id is null
--   union all select 'player_characters', count(*) from public.player_characters where user_id is null
--   union all select 'modules', count(*) from public.modules where user_id is null;
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'npcs', 'locations', 'lore_entries', 'factions',
    'hooks', 'sessions', 'player_characters', 'modules'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users manage own %s" on public.%I', t, t);
    execute format(
      'create policy "Users manage own %s" on public.%I for all '
      || 'to authenticated '
      || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end $$;
