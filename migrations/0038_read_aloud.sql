-- ============================================================
-- Read-aloud text
-- ============================================================
-- Boxed text for scenes and places: what the DM reads to the players as they
-- arrive. Play shows the current scene's read-aloud large, so it can be read
-- straight off the screen, and Prep gathers it from the scenes picked.
-- ============================================================

alter table public.scenes add column if not exists read_aloud text;
alter table public.locations add column if not exists read_aloud text;

-- Same limit as other prose (src/lib/fieldLimits.ts, LIMIT.PROSE).
alter table public.scenes drop constraint if exists scenes_read_aloud_len_chk;
alter table public.scenes add constraint scenes_read_aloud_len_chk check (char_length(read_aloud) <= 8000) not valid;
alter table public.locations drop constraint if exists locations_read_aloud_len_chk;
alter table public.locations add constraint locations_read_aloud_len_chk check (char_length(read_aloud) <= 8000) not valid;
