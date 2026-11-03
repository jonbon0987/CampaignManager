-- ============================================================
-- Which rules a campaign plays by (audit II, phase 7)
-- ============================================================
--   campaigns.rules_edition   '2014' or '2024'. Encounter difficulty follows
--                             it: the 2014 DMG's thresholds and multipliers, or
--                             the 2024 DMG's XP budget per character (Low,
--                             Moderate, High). Null reads as 2014, the rules
--                             the app rated by until now.
-- ============================================================

alter table public.campaigns add column if not exists rules_edition text;

alter table public.campaigns drop constraint if exists campaigns_rules_edition_chk;
alter table public.campaigns add constraint campaigns_rules_edition_chk
  check (rules_edition is null or rules_edition in ('2014', '2024')) not valid;
