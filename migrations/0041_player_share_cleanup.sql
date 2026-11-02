-- ============================================================
-- Player shares go with their item
-- ============================================================
-- player_shares points at NPCs, places, lore, handouts and sessions without a
-- foreign key (it names one of five tables), so deleting a shared item left
-- its share behind. The page never showed it, but the DM's counts did. Each
-- of those tables now drops its shares when a row is deleted, and shares left
-- over from before are cleared.
-- ============================================================

create or replace function public.drop_player_shares()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.player_shares where kind = tg_argv[0] and item_id = old.id;
  return old;
end;
$$;

drop trigger if exists npcs_drop_player_shares on public.npcs;
create trigger npcs_drop_player_shares after delete on public.npcs
  for each row execute function public.drop_player_shares('npc');

drop trigger if exists locations_drop_player_shares on public.locations;
create trigger locations_drop_player_shares after delete on public.locations
  for each row execute function public.drop_player_shares('location');

drop trigger if exists lore_entries_drop_player_shares on public.lore_entries;
create trigger lore_entries_drop_player_shares after delete on public.lore_entries
  for each row execute function public.drop_player_shares('lore');

drop trigger if exists handouts_drop_player_shares on public.handouts;
create trigger handouts_drop_player_shares after delete on public.handouts
  for each row execute function public.drop_player_shares('handout');

drop trigger if exists sessions_drop_player_shares on public.sessions;
create trigger sessions_drop_player_shares after delete on public.sessions
  for each row execute function public.drop_player_shares('session');

delete from public.player_shares s
where (s.kind = 'npc'      and not exists (select 1 from public.npcs n         where n.id = s.item_id))
   or (s.kind = 'location' and not exists (select 1 from public.locations l    where l.id = s.item_id))
   or (s.kind = 'lore'     and not exists (select 1 from public.lore_entries e where e.id = s.item_id))
   or (s.kind = 'handout'  and not exists (select 1 from public.handouts h     where h.id = s.item_id))
   or (s.kind = 'session'  and not exists (select 1 from public.sessions x     where x.id = s.item_id));
