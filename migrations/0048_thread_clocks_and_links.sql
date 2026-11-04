-- ============================================================
-- Clocks and links on threads (audit II, phase 9)
-- ============================================================
--   hooks.clock_size    4, 6 or 8 segments; null for a thread with no clock.
--   hooks.clock_filled  How many are filled. A full clock moves a seed or cold
--                       thread to Active.
--   hooks.clock_label   What happens when it fills ("The Tide Cult raises the
--                       crown").
--   hooks.npc_ids, location_ids, faction_ids, module_id
--                       What the thread touches. Arrays like npcs.faction_ids;
--                       a link to a deleted record is shown as deleted.
-- ============================================================

alter table public.hooks
  add column if not exists clock_size integer,
  add column if not exists clock_filled integer not null default 0,
  add column if not exists clock_label text,
  add column if not exists npc_ids uuid[] default '{}',
  add column if not exists location_ids uuid[] default '{}',
  add column if not exists faction_ids uuid[] default '{}',
  add column if not exists module_id uuid references public.modules(id) on delete set null;

alter table public.hooks drop constraint if exists hooks_clock_size_chk;
alter table public.hooks add constraint hooks_clock_size_chk
  check (clock_size is null or clock_size in (4, 6, 8)) not valid;

alter table public.hooks drop constraint if exists hooks_clock_filled_range_chk;
alter table public.hooks add constraint hooks_clock_filled_range_chk
  check (clock_filled between 0 and 8) not valid;

alter table public.hooks drop constraint if exists hooks_clock_label_len_chk;
alter table public.hooks add constraint hooks_clock_label_len_chk
  check (clock_label is null or char_length(clock_label) <= 120) not valid;
