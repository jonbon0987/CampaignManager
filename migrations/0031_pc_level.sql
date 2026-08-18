-- ============================================================
-- Player character level
-- ============================================================
-- Adds a character level (1–20) to player_characters. Feeds the random
-- encounter table's party-level auto-fill, and is useful context elsewhere.
--
-- Run this in the Supabase SQL editor.
-- ============================================================

alter table public.player_characters
  add column if not exists level integer;

-- Range CHECK (mirrors src/lib/fieldLimits.ts).
alter table public.player_characters
  add constraint player_characters_level_range_chk check (level between 1 and 20) not valid;
