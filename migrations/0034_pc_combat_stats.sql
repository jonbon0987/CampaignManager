-- ============================================================
-- Player character max HP and armour class
-- ============================================================
-- Adds max_hp and armor_class to player_characters, set from the PC's page in
-- Cast. The initiative tracker starts each PC with them, so the party no
-- longer joins a fight at 0 HP.
-- ============================================================

alter table public.player_characters
  add column if not exists max_hp integer,
  add column if not exists armor_class integer;

-- Range CHECKs (mirror src/lib/fieldLimits.ts).
alter table public.player_characters
  add constraint player_characters_max_hp_range_chk check (max_hp between 1 and 999) not valid;
alter table public.player_characters
  add constraint player_characters_armor_class_range_chk check (armor_class between 1 and 40) not valid;
