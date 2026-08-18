-- ============================================================
-- Random Encounter Tables → typed kinds + subtitle
-- ============================================================
-- Adds the table "kind" (encounter | treasure | magic | wild | custom) and a
-- one-line subtitle, and moves the default die to a weighted d100. Existing
-- rows keep their die_size; the app treats tables as weighted d100 regardless.
--
-- Run this in the Supabase SQL editor after 0029_random_encounter_tables.sql.
-- ============================================================

alter table public.random_encounter_tables
  add column if not exists kind     text not null default 'encounter',   -- encounter | treasure | magic | wild | custom
  add column if not exists subtitle text;

alter table public.random_encounter_tables alter column die_size set default 100;

-- Length CHECK for the new subtitle column (mirrors src/lib/fieldLimits.ts).
alter table public.random_encounter_tables
  add constraint random_encounter_tables_subtitle_len_chk check (char_length(subtitle) <= 240) not valid;
