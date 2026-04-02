-- ============================================================
-- Add linked_encounter_ids to submodules
-- ============================================================
-- Run this in the Supabase SQL editor after add_encounters.sql.
-- ============================================================

alter table public.submodules
  add column if not exists linked_encounter_ids jsonb default '[]'::jsonb;
