-- ============================================================
-- Archived campaigns and dated world events (audit II, phase 8)
-- ============================================================
--   campaigns.archived_at   When the campaign was archived; null while it's
--                           in use. An archived campaign drops out of the
--                           world's campaign lists until it's restored from
--                           its Settings, and nothing in it is deleted.
--   timeline_events.day     The day of the year in the world's calendar, for
--                           an event set to a date ("14 Mirtul 1492"); null for
--                           one known only by its year.
-- ============================================================

alter table public.campaigns add column if not exists archived_at timestamptz;

alter table public.timeline_events add column if not exists day integer;

alter table public.timeline_events drop constraint if exists timeline_events_day_chk;
alter table public.timeline_events add constraint timeline_events_day_chk
  check (day is null or day between 1 and 16000) not valid;
