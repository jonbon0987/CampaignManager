-- ============================================================
-- The in-world calendar
-- ============================================================
-- Worlds had a year and a calendar label nobody could edit. This adds:
--
--   worlds.calendar_months     the world's months, in order:
--                              [{"name": "Hammer", "days": 30}, …]. A one-day
--                              "month" is a festival (Midwinter). Null means
--                              the app's default (twelve months of thirty days).
--                              worlds.calendar becomes the year's suffix ("DR").
--   campaigns.world_date       where the campaign is in the world's time:
--                              {"year": 1492, "day": 134}, day counted from the
--                              first of the year
--   sessions.world_start/_end  the in-world dates a session began and ended;
--                              Play stamps them as it starts and ends
--   sessions.timeline_event_id the world Timeline event a session was posted
--                              as, so posting again updates it
-- ============================================================

alter table public.worlds add column if not exists calendar_months jsonb;
alter table public.campaigns add column if not exists world_date jsonb;
alter table public.sessions add column if not exists world_start jsonb;
alter table public.sessions add column if not exists world_end jsonb;
alter table public.sessions add column if not exists timeline_event_id uuid references public.timeline_events(id) on delete set null;
create index if not exists sessions_timeline_event_id_idx on public.sessions(timeline_event_id);

-- --------------- Shape CHECK constraints ---------------

alter table public.worlds drop constraint if exists worlds_calendar_months_shape_chk;
alter table public.worlds add constraint worlds_calendar_months_shape_chk
  check (calendar_months is null or (jsonb_typeof(calendar_months) = 'array' and jsonb_array_length(calendar_months) between 1 and 40)) not valid;

alter table public.campaigns drop constraint if exists campaigns_world_date_shape_chk;
alter table public.campaigns add constraint campaigns_world_date_shape_chk
  check (world_date is null or (jsonb_typeof(world_date -> 'year') = 'number' and jsonb_typeof(world_date -> 'day') = 'number')) not valid;

alter table public.sessions drop constraint if exists sessions_world_start_shape_chk;
alter table public.sessions add constraint sessions_world_start_shape_chk
  check (world_start is null or (jsonb_typeof(world_start -> 'year') = 'number' and jsonb_typeof(world_start -> 'day') = 'number')) not valid;
alter table public.sessions drop constraint if exists sessions_world_end_shape_chk;
alter table public.sessions add constraint sessions_world_end_shape_chk
  check (world_end is null or (jsonb_typeof(world_end -> 'year') = 'number' and jsonb_typeof(world_end -> 'day') = 'number')) not valid;
