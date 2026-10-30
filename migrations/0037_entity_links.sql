-- ============================================================
-- Links where there was free text
-- ============================================================
-- An NPC's location, a faction's key figures and a PC's key NPCs were typed
-- in as text, beside real links that already existed (factions, NPCs). They
-- become links:
--
--   npcs.location_id                 the place the NPC is found
--   factions.key_figure_ids          NPCs who matter most in the faction
--   player_characters.key_npc_ids    NPCs who matter most to the character
--
-- and an NPC's affiliation joins its faction_ids when it names a faction.
--
-- The links are filled from the text where it names a record in the same
-- campaign or world: an @-mention, an exact name, or a name the text
-- contains (four letters or more; for a place, the longest such name).
-- Nothing is removed: the text columns stay as they are, and the editors show
-- any text beside the links so the DM can check them and clear it.
-- ============================================================

alter table public.npcs
  add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.factions
  add column if not exists key_figure_ids uuid[] not null default '{}';
alter table public.player_characters
  add column if not exists key_npc_ids uuid[] not null default '{}';

create index if not exists npcs_location_id_idx on public.npcs (location_id);

-- Which places an NPC can be at: its campaign's own, those the campaign links
-- from canon, and canon in its world (or its campaign's world).
create or replace function pg_temp.npc_can_see_location(n public.npcs, l public.locations) returns boolean
language sql stable as $$
  select l.user_id = n.user_id and (
    (n.campaign_id is not null and (
       l.campaign_id = n.campaign_id
       or exists (select 1 from public.campaign_locations cl where cl.campaign_id = n.campaign_id and cl.location_id = l.id)
       or (l.world_id is not null and l.world_id = (select c.world_id from public.campaigns c where c.id = n.campaign_id))))
    or (n.world_id is not null and l.world_id = n.world_id))
$$;

-- Which NPCs a record in a campaign or world can name.
create or replace function pg_temp.can_see_npc(owner uuid, campaign uuid, world uuid, n public.npcs) returns boolean
language sql stable as $$
  select n.user_id = owner and (
    (campaign is not null and (
       n.campaign_id = campaign
       or exists (select 1 from public.campaign_npcs cn where cn.campaign_id = campaign and cn.npc_id = n.id)
       or (n.world_id is not null and n.world_id = (select c.world_id from public.campaigns c where c.id = campaign))))
    or (world is not null and n.world_id = world))
$$;

-- 1. An NPC's place: an exact name first, else the longest place name the text contains.
update public.npcs n
   set location_id = coalesce(
     (select l.id from public.locations l
       where pg_temp.npc_can_see_location(n, l) and lower(trim(l.name)) = lower(trim(n.location))
       order by l.campaign_id is null, l.created_at limit 1),
     (select l.id from public.locations l
       where pg_temp.npc_can_see_location(n, l) and char_length(trim(l.name)) >= 4
         and position(lower(trim(l.name)) in lower(n.location)) > 0
       order by char_length(trim(l.name)) desc, l.campaign_id is null, l.created_at limit 1))
 where n.location_id is null and coalesce(trim(n.location), '') <> '';

-- 2. An NPC's affiliation: factions it names join the NPC's factions.
update public.npcs n
   set faction_ids = (
     select array_agg(distinct id) from (
       select unnest(coalesce(n.faction_ids, '{}')) as id
       union
       select f.id from public.factions f
        where f.user_id = n.user_id
          and ((n.campaign_id is not null and f.campaign_id = n.campaign_id)
               or (f.world_id is not null and f.world_id = coalesce(n.world_id, (select c.world_id from public.campaigns c where c.id = n.campaign_id))))
          and (lower(trim(f.name)) = lower(trim(n.affiliation))
               or (char_length(trim(f.name)) >= 4 and position(lower(trim(f.name)) in lower(n.affiliation)) > 0))
     ) ids)
 where coalesce(trim(n.affiliation), '') <> '';

-- 3. A faction's key figures: NPCs @-mentioned in the text, or named in it.
update public.factions f
   set key_figure_ids = coalesce((
     select array_agg(distinct n.id) from public.npcs n
      where pg_temp.can_see_npc(f.user_id, f.campaign_id, f.world_id, n)
        and (f.key_figures ~* ('npc:' || n.id::text)
             or (char_length(trim(n.name)) >= 4 and position(lower(trim(n.name)) in lower(f.key_figures)) > 0))
   ), '{}')
 where coalesce(trim(f.key_figures), '') <> '' and cardinality(f.key_figure_ids) = 0;

-- 4. A PC's key NPCs, the same way.
update public.player_characters p
   set key_npc_ids = coalesce((
     select array_agg(distinct n.id) from public.npcs n
      where pg_temp.can_see_npc(p.user_id, p.campaign_id, null, n)
        and (p.key_npcs ~* ('npc:' || n.id::text)
             or (char_length(trim(n.name)) >= 4 and position(lower(trim(n.name)) in lower(p.key_npcs)) > 0))
   ), '{}')
 where coalesce(trim(p.key_npcs), '') <> '' and cardinality(p.key_npc_ids) = 0;
