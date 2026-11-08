-- ============================================================
-- House rules (audit II, D9)
-- ============================================================
-- What a table plays differently from the book.
--
--   campaigns.house_rules         A list of { id, topic, title, text }. It's short,
--                                 belongs to one campaign and is only ever read
--                                 whole, so it sits on the campaign as JSON. Nullable
--                                 so a campaign deleted before this migration can
--                                 still be restored from Recently deleted.
--   player_pages.show_house_rules Off until the DM adds them to the player page.
--
-- player_page() gains 'house_rules', and is otherwise unchanged from 0050.
-- ============================================================

alter table public.campaigns add column if not exists house_rules jsonb default '[]'::jsonb;

alter table public.campaigns drop constraint if exists campaigns_house_rules_chk;
alter table public.campaigns add constraint campaigns_house_rules_chk
  check (house_rules is null or (jsonb_typeof(house_rules) = 'array' and octet_length(house_rules::text) <= 100000)) not valid;

alter table public.player_pages add column if not exists show_house_rules boolean not null default false;

create or replace function public.player_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with page as (
    select p.campaign_id, p.user_id, p.show_next_session, p.show_world_date, p.show_treasury, p.show_house_rules,
           c.name, c.title, c.session_repeat, c.world_date, c.world_id, c.house_rules
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
    ), '[]'::jsonb),

    -- A thread's title and its player-facing words: never its summary, clock or notes.
    'threads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'text', t.player_text,
        'done', coalesce(t.state, case when t.is_active then 'active' else 'resolved' end) = 'resolved'
      ) order by t.title)
      from public.hooks t
      join page on page.campaign_id = t.campaign_id and page.user_id = t.user_id
      where t.id in (select item_id from shared where kind = 'thread')
    ), '[]'::jsonb),

    -- When the next session is: its number and date, never its title or prep.
    'schedule', (
      select jsonb_build_object(
        'number', (select s.session_number from public.sessions s where s.campaign_id = page.campaign_id and s.user_id = page.user_id and s.status = 'planned' order by s.session_number limit 1),
        'date', (select s.session_date from public.sessions s where s.campaign_id = page.campaign_id and s.user_id = page.user_id and s.status = 'planned' order by s.session_number limit 1),
        'time', (select s.session_time from public.sessions s where s.campaign_id = page.campaign_id and s.user_id = page.user_id and s.status = 'planned' order by s.session_number limit 1),
        'repeat', page.session_repeat,
        'last_date', (select s.session_date from public.sessions s where s.campaign_id = page.campaign_id and s.user_id = page.user_id and s.session_date is not null order by s.session_date desc limit 1),
        'last_time', (select s.session_time from public.sessions s where s.campaign_id = page.campaign_id and s.user_id = page.user_id and s.session_date is not null order by s.session_date desc limit 1)
      )
      from page where page.show_next_session
    ),

    'world_date', (
      select jsonb_build_object('date', page.world_date, 'months', w.calendar_months, 'suffix', w.calendar)
      from page join public.worlds w on w.id = page.world_id and w.user_id = page.user_id
      where page.show_world_date and page.world_date is not null
    ),

    'treasury', (
      select jsonb_build_object(
        'cp', coalesce(sum(e.cp), 0), 'sp', coalesce(sum(e.sp), 0), 'ep', coalesce(sum(e.ep), 0),
        'gp', coalesce(sum(e.gp), 0), 'pp', coalesce(sum(e.pp), 0))
      from page left join public.treasury_entries e on e.campaign_id = page.campaign_id and e.user_id = page.user_id
      where page.show_treasury
      group by page.campaign_id
    ),

    -- How this table plays, once the DM adds it to the page.
    'house_rules', (select coalesce(page.house_rules, '[]'::jsonb) from page where page.show_house_rules)
  )
  where exists (select 1 from page);
$$;

revoke all on function public.player_page(text) from public;
grant execute on function public.player_page(text) to anon, authenticated;
