-- ============================================================
-- Treasury, scheduling and the players' quest log (audit II, phase 9)
-- ============================================================
--   treasury_entries         The party's coin, as a ledger: each line adds to
--                            or takes from the stash, with a note, the session
--                            and the PC it went to. The balance is their sum.
--   sessions.session_time    When a session starts, as 'HH:MM'.
--   campaigns.session_repeat 'weekly' or 'fortnightly': a new session is dated
--                            on from the last one.
--   hooks.player_text        A thread in the players' own words. The player
--                            page shows this and the title, never the summary.
--   player_shares 'thread'   Threads known to the party.
--   player_pages.show_*      Next session, in-world date and treasure. Off
--                            until the DM switches them on, like the rest of
--                            the page.
--
-- player_page() is replaced to return those, and nothing else new.
-- ============================================================

-- --------------- treasury ---------------

create table if not exists public.treasury_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  pc_id        uuid references public.player_characters(id) on delete set null,
  cp           integer not null default 0,
  sp           integer not null default 0,
  ep           integer not null default 0,
  gp           integer not null default 0,
  pp           integer not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.treasury_entries enable row level security;
drop policy if exists "Users manage own treasury entries" on public.treasury_entries;
create policy "Users manage own treasury entries" on public.treasury_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists treasury_entries_user_id_idx on public.treasury_entries(user_id);
create index if not exists treasury_entries_campaign_id_idx on public.treasury_entries(campaign_id);
create index if not exists treasury_entries_session_id_idx on public.treasury_entries(session_id);
create index if not exists treasury_entries_pc_id_idx on public.treasury_entries(pc_id);
drop trigger if exists treasury_entries_updated_at on public.treasury_entries;
create trigger treasury_entries_updated_at before update on public.treasury_entries for each row execute function public.set_updated_at();

drop trigger if exists treasury_entries_to_trash on public.treasury_entries;
create trigger treasury_entries_to_trash before delete on public.treasury_entries for each row execute function public.trash_capture();

alter table public.treasury_entries drop constraint if exists treasury_entries_note_len_chk;
alter table public.treasury_entries add constraint treasury_entries_note_len_chk check (char_length(note) <= 240) not valid;
alter table public.treasury_entries drop constraint if exists treasury_entries_coins_range_chk;
alter table public.treasury_entries add constraint treasury_entries_coins_range_chk check (
  cp between -9999999 and 9999999 and sp between -9999999 and 9999999 and ep between -9999999 and 9999999
  and gp between -9999999 and 9999999 and pp between -9999999 and 9999999
) not valid;

-- --------------- scheduling ---------------

alter table public.sessions add column if not exists session_time text;
alter table public.sessions drop constraint if exists sessions_session_time_chk;
alter table public.sessions add constraint sessions_session_time_chk
  check (session_time is null or session_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

alter table public.campaigns add column if not exists session_repeat text;
alter table public.campaigns drop constraint if exists campaigns_session_repeat_chk;
alter table public.campaigns add constraint campaigns_session_repeat_chk
  check (session_repeat is null or session_repeat in ('weekly', 'fortnightly')) not valid;

-- --------------- the quest log ---------------

alter table public.hooks add column if not exists player_text text;
alter table public.hooks drop constraint if exists hooks_player_text_len_chk;
alter table public.hooks add constraint hooks_player_text_len_chk check (char_length(player_text) <= 8000) not valid;

alter table public.player_shares drop constraint if exists player_shares_kind_check;
alter table public.player_shares add constraint player_shares_kind_check
  check (kind in ('npc', 'location', 'lore', 'handout', 'session', 'thread')) not valid;

drop trigger if exists hooks_drop_player_shares on public.hooks;
create trigger hooks_drop_player_shares after delete on public.hooks
  for each row execute function public.drop_player_shares('thread');

alter table public.player_pages
  add column if not exists show_next_session boolean not null default false,
  add column if not exists show_world_date boolean not null default false,
  add column if not exists show_treasury boolean not null default false;

-- --------------- what the page shows ---------------

create or replace function public.player_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with page as (
    select p.campaign_id, p.user_id, p.show_next_session, p.show_world_date, p.show_treasury,
           c.name, c.title, c.session_repeat, c.world_date, c.world_id
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
    )
  )
  where exists (select 1 from page);
$$;

revoke all on function public.player_page(text) from public;
grant execute on function public.player_page(text) to anon, authenticated;
