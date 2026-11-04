-- ============================================================
-- Pins on maps, and factions in the relationship web (audit II, phase 9)
-- ============================================================
--   locations.map_pins      Pins on the place's map: a list of
--                           { id, x, y, place_id, label }, with x and y as
--                           percentages of the map so they survive resizing.
--   character_relationships A relationship's ends can now be factions too.
-- ============================================================

alter table public.locations add column if not exists map_pins jsonb not null default '[]'::jsonb;

alter table public.locations drop constraint if exists locations_map_pins_array_chk;
alter table public.locations add constraint locations_map_pins_array_chk
  check (jsonb_typeof(map_pins) = 'array') not valid;

alter table public.character_relationships drop constraint if exists character_relationships_from_kind_check;
alter table public.character_relationships add constraint character_relationships_from_kind_check
  check (from_kind in ('pc', 'npc', 'faction')) not valid;

alter table public.character_relationships drop constraint if exists character_relationships_to_kind_check;
alter table public.character_relationships add constraint character_relationships_to_kind_check
  check (to_kind in ('pc', 'npc', 'faction')) not valid;
