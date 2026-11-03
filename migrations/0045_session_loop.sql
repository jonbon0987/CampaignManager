-- ============================================================
-- The session loop (audit II, phase 6)
-- ============================================================
-- What the party strip in Play and the end-of-session wrap-up need:
--
--   player_characters.sheet_url              the player's own sheet (D&D Beyond
--                                            or anywhere), opened from the app
--   player_characters.passive_perception     the numbers a DM checks mid-scene,
--   player_characters.passive_insight        typed in from the sheet
--   player_characters.passive_investigation
--   player_characters.spell_save_dc
--   player_characters.xp                     experience so far, for tables that
--                                            level by XP
--   campaigns.levelling                      'xp' or 'milestone'; null until the
--                                            first wrap-up asks
--
-- Where the party stopped and who holds inspiration live in sessions.play
-- (jsonb), so they need no columns.
-- ============================================================

alter table public.player_characters add column if not exists sheet_url text;
alter table public.player_characters add column if not exists passive_perception smallint;
alter table public.player_characters add column if not exists passive_insight smallint;
alter table public.player_characters add column if not exists passive_investigation smallint;
alter table public.player_characters add column if not exists spell_save_dc smallint;
alter table public.player_characters add column if not exists xp integer;
alter table public.campaigns add column if not exists levelling text;

-- --------------- Limits (as src/lib/fieldLimits.ts) ---------------

alter table public.player_characters drop constraint if exists player_characters_sheet_url_len_chk;
alter table public.player_characters add constraint player_characters_sheet_url_len_chk
  check (char_length(sheet_url) <= 500) not valid;
alter table public.player_characters drop constraint if exists player_characters_sheet_url_web_chk;
alter table public.player_characters add constraint player_characters_sheet_url_web_chk
  check (sheet_url is null or sheet_url ~* '^https?://') not valid;

alter table public.player_characters drop constraint if exists player_characters_passive_perception_range_chk;
alter table public.player_characters add constraint player_characters_passive_perception_range_chk
  check (passive_perception between 1 and 40) not valid;
alter table public.player_characters drop constraint if exists player_characters_passive_insight_range_chk;
alter table public.player_characters add constraint player_characters_passive_insight_range_chk
  check (passive_insight between 1 and 40) not valid;
alter table public.player_characters drop constraint if exists player_characters_passive_investigation_range_chk;
alter table public.player_characters add constraint player_characters_passive_investigation_range_chk
  check (passive_investigation between 1 and 40) not valid;
alter table public.player_characters drop constraint if exists player_characters_spell_save_dc_range_chk;
alter table public.player_characters add constraint player_characters_spell_save_dc_range_chk
  check (spell_save_dc between 1 and 40) not valid;
alter table public.player_characters drop constraint if exists player_characters_xp_range_chk;
alter table public.player_characters add constraint player_characters_xp_range_chk
  check (xp between 0 and 999999) not valid;

alter table public.campaigns drop constraint if exists campaigns_levelling_chk;
alter table public.campaigns add constraint campaigns_levelling_chk
  check (levelling is null or levelling in ('xp', 'milestone')) not valid;
