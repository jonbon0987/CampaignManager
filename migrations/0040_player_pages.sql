-- ============================================================
-- Player pages: a read-only page the DM shares with the players
-- ============================================================
-- One page per campaign, at /p/<token>. Nothing is on it until the DM
-- switches an item on, and then only the item's player-facing fields:
--
--   player_pages          the campaign's link: a long random token, which can
--                         be turned off or replaced (the old link then stops
--                         working)
--   player_shares         what players can see: an NPC, place, lore entry,
--                         handout or session recap, per campaign, so canon
--                         linked into two campaigns can be shared in one and
--                         not the other
--   player_page(token)    what the page shows, for anyone holding a live
--                         token. It runs as its owner and returns only
--                         player-facing fields; players never read the tables.
--   player_image_shared   lets anyone sign a picture while it belongs to an
--                         item shared on a live page
--
-- Kept back always: DM notes, prep notes, hooks and motivations, disposition,
-- history, read-aloud, "left open", lore marked DM-only. The party's names,
-- classes and portraits show on every page.
-- ============================================================

-- --------------- player_pages ---------------

create table if not exists public.player_pages (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint player_pages_token_len_chk check (char_length(token) between 32 and 128)
);

alter table public.player_pages enable row level security;
drop policy if exists "Users manage own player pages" on public.player_pages;
create policy "Users manage own player pages" on public.player_pages
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );
create index if not exists player_pages_user_id_idx on public.player_pages(user_id);
drop trigger if exists player_pages_updated_at on public.player_pages;
create trigger player_pages_updated_at before update on public.player_pages for each row execute function public.set_updated_at();

-- --------------- player_shares ---------------

create table if not exists public.player_shares (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('npc', 'location', 'lore', 'handout', 'session')),
  item_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, kind, item_id)
);

alter table public.player_shares enable row level security;
drop policy if exists "Users manage own player shares" on public.player_shares;
create policy "Users manage own player shares" on public.player_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists player_shares_user_id_idx on public.player_shares(user_id);
create index if not exists player_shares_item_id_idx on public.player_shares(item_id);

-- --------------- what the page shows ---------------
-- Every item must belong to the page's owner and to its campaign (its own, or
-- canon linked into it), so a share row can never reach anyone else's data.

create or replace function public.player_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with page as (
    select p.campaign_id, p.user_id, c.name, c.title
    from public.player_pages p
    join public.campaigns c on c.id = p.campaign_id and c.user_id = p.user_id
    where p.token = p_token and p.enabled
  ),
  shared as (
    select s.kind, s.item_id
    from public.player_shares s
    join page on page.campaign_id = s.campaign_id and page.user_id = s.user_id
  )
  select jsonb_build_object(
    'campaign', (select jsonb_build_object('name', page.name, 'title', page.title) from page),

    'party', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id, 'name', pc.character_name, 'player', pc.player_name, 'race', pc.race,
        'class', pc.class, 'level', pc.level, 'portrait', pc.portrait_path
      ) order by pc.character_name)
      from public.player_characters pc
      join page on page.campaign_id = pc.campaign_id and page.user_id = pc.user_id
      where pc.is_active
    ), '[]'::jsonb),

    'recaps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'number', s.session_number, 'title', s.title, 'date', s.session_date,
        'summary', s.summary, 'loot', s.loot_rewards
      ) order by s.session_number desc)
      from public.sessions s
      join page on page.campaign_id = s.campaign_id and page.user_id = s.user_id
      where s.id in (select item_id from shared where kind = 'session')
    ), '[]'::jsonb),

    'handouts', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'image', h.image_path)
        order by h.sort_order, h.created_at)
      from public.handouts h
      join page on page.campaign_id = h.campaign_id and page.user_id = h.user_id
      where h.id in (select item_id from shared where kind = 'handout')
    ), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'name', n.name, 'role', n.role, 'status', n.status,
        'description', n.description, 'portrait', n.portrait_path
      ) order by n.name)
      from public.npcs n
      join page on page.user_id = n.user_id
      where n.id in (select item_id from shared where kind = 'npc')
        and (n.campaign_id = page.campaign_id
          or exists (select 1 from public.campaign_npcs cn where cn.campaign_id = page.campaign_id and cn.npc_id = n.id))
    ), '[]'::jsonb),

    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'type', l.location_type, 'region', l.region,
        'description', l.description, 'map', l.map_path
      ) order by l.name)
      from public.locations l
      join page on page.user_id = l.user_id
      where l.id in (select item_id from shared where kind = 'location')
        and (l.campaign_id = page.campaign_id
          or exists (select 1 from public.campaign_locations cl where cl.campaign_id = page.campaign_id and cl.location_id = l.id))
    ), '[]'::jsonb),

    'lore', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'category', e.category, 'content', e.content
      ) order by e.title)
      from public.lore_entries e
      join page on page.user_id = e.user_id
      where e.id in (select item_id from shared where kind = 'lore')
        and not e.dm_only
        and (e.campaign_id = page.campaign_id
          or exists (select 1 from public.campaign_lore cl where cl.campaign_id = page.campaign_id and cl.lore_id = e.id))
    ), '[]'::jsonb)
  )
  where exists (select 1 from page);
$$;

revoke all on function public.player_page(text) from public;
grant execute on function public.player_page(text) to anon, authenticated;

-- --------------- pictures on a live page ---------------

create or replace function public.player_image_shared(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.player_shares s
    join public.player_pages p on p.campaign_id = s.campaign_id and p.user_id = s.user_id and p.enabled
    where (s.kind = 'npc' and exists (
            select 1 from public.npcs n where n.id = s.item_id and n.user_id = s.user_id and n.portrait_path = p_name))
       or (s.kind = 'location' and exists (
            select 1 from public.locations l where l.id = s.item_id and l.user_id = s.user_id and l.map_path = p_name))
       or (s.kind = 'handout' and exists (
            select 1 from public.handouts h where h.id = s.item_id and h.user_id = s.user_id
              and h.campaign_id = s.campaign_id and h.image_path = p_name))
  ) or exists (
    select 1
    from public.player_characters pc
    join public.player_pages p on p.campaign_id = pc.campaign_id and p.user_id = pc.user_id and p.enabled
    where pc.is_active and pc.portrait_path = p_name
  );
$$;

revoke all on function public.player_image_shared(text) from public;
grant execute on function public.player_image_shared(text) to anon, authenticated;

drop policy if exists "Anyone sees pictures shared on a player page" on storage.objects;
create policy "Anyone sees pictures shared on a player page" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'entity-images' and public.player_image_shared(name));
