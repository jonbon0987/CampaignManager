-- ============================================================
-- Recently deleted: every delete can be undone for 30 days
-- ============================================================
-- A delete used to be final. Now each one is kept in `trash` first:
--
--   trash               one row per deleted record, as it was (`data`),
--                       grouped by `batch` (the transaction): a module's
--                       batch also holds its parts, scenes and handouts, which
--                       its cascades deleted with it. `relinks` remembers rows
--                       whose link to it was set to null (an NPC's place, a
--                       sub-place's parent, a campaign's world), so restoring
--                       puts those links back too.
--   trash_capture()     the BEFORE DELETE trigger on every table of the DM's
--                       content that fills it
--   restore_deleted(batch) / restore_record(table, id)
--                       put a batch back, parents first, then relink. They run
--                       as the user, so row-level security applies.
--   deleted_items()     one row per batch, for the "Recently deleted" list
--   purge_deleted(batch?)
--                       forgets a batch (or everything older than 30 days)
--                       and returns the stored files nothing uses any more,
--                       which the app then removes. Files are kept until then
--                       so a restored handout or portrait still has its
--                       picture.
-- ============================================================

create table if not exists public.trash (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  batch       bigint not null,
  table_name  text not null,
  record_id   uuid,
  data        jsonb not null,
  relinks     jsonb not null default '[]'::jsonb,
  deleted_at  timestamptz not null default now()
);

-- Users read and forget their own; only the trigger writes.
alter table public.trash enable row level security;
drop policy if exists "Users read own trash" on public.trash;
create policy "Users read own trash" on public.trash for select using (auth.uid() = user_id);
drop policy if exists "Users forget own trash" on public.trash;
create policy "Users forget own trash" on public.trash for delete using (auth.uid() = user_id);
create index if not exists trash_user_batch_idx on public.trash(user_id, batch);
create index if not exists trash_user_record_idx on public.trash(user_id, table_name, record_id);
create index if not exists trash_deleted_at_idx on public.trash(deleted_at);

-- --------------- capture ---------------

create or replace function public.trash_capture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_json jsonb := to_jsonb(old);
  rid uuid := nullif(row_json->>'id', '')::uuid;
  fk record;
  ids uuid[];
  links jsonb := '[]'::jsonb;
begin
  -- Rows whose link to this one the delete is about to set to null.
  if rid is not null then
    for fk in
      select cl.relname as child_table, a.attname as child_column
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.contype = 'f' and con.confrelid = tg_relid and con.confdeltype = 'n'
        and cl.relnamespace = 'public'::regnamespace
    loop
      execute format('select coalesce(array_agg(id), ''{}'') from public.%I where %I = $1', fk.child_table, fk.child_column)
        into ids using rid;
      if cardinality(ids) > 0 then
        links := links || jsonb_build_array(jsonb_build_object('table', fk.child_table, 'column', fk.child_column, 'ids', to_jsonb(ids)));
      end if;
    end loop;
  end if;

  insert into public.trash (user_id, batch, table_name, record_id, data, relinks)
  values ((row_json->>'user_id')::uuid, txid_current(), tg_table_name, rid, row_json, links);
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'worlds', 'campaigns', 'campaign_npcs', 'campaign_locations', 'campaign_lore',
    'sessions', 'player_characters', 'npcs', 'locations', 'factions', 'hooks', 'ideas', 'lore_entries',
    'timeline_events', 'modules', 'module_sheets', 'module_dependencies', 'submodules', 'submodule_dependencies',
    'scenes', 'handouts', 'character_relationships', 'monster_statblocks', 'encounters', 'random_encounter_tables',
    'session_recordings', 'recording_tracks', 'recording_chunks', 'transcript_segments', 'recording_moments',
    'speaker_links', 'player_consents', 'chronicle_proposals', 'chronicle_applied', 'entity_session_entries',
    'discord_posts', 'player_pages', 'player_shares'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_to_trash', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.trash_capture()', t || '_to_trash', t);
  end loop;
end $$;

-- --------------- restore ---------------

create or replace function public.restore_deleted(p_batch bigint)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
  l jsonb;
  n integer := 0;
begin
  for r in select * from public.trash where batch = p_batch and user_id = auth.uid() order by id loop
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', r.table_name, r.table_name)
      using r.data;
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'There’s nothing to restore. It may have been restored already, or deleted for good.';
  end if;

  for r in select * from public.trash where batch = p_batch and user_id = auth.uid() and relinks <> '[]'::jsonb order by id loop
    for l in select value from jsonb_array_elements(r.relinks) loop
      execute format('update public.%I set %I = $1 where id = any($2) and %I is null', l->>'table', l->>'column', l->>'column')
        using r.record_id, array(select jsonb_array_elements_text(l->'ids'))::uuid[];
    end loop;
  end loop;

  delete from public.trash where batch = p_batch and user_id = auth.uid();
  return n;
exception
  when unique_violation then
    raise exception 'Can’t restore it: something newer has taken its place (%).', sqlerrm;
  when foreign_key_violation then
    raise exception 'Can’t restore it: what it belonged to has been deleted too. Restore that first.';
end;
$$;

/** Restores the most recent delete of one record, with everything it took along. */
create or replace function public.restore_record(p_table text, p_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare b bigint;
begin
  select batch into b from public.trash
  where user_id = auth.uid() and table_name = p_table and record_id = p_id
  order by id desc limit 1;
  if b is null then
    raise exception 'There’s nothing to restore. It may have been restored already, or deleted for good.';
  end if;
  return public.restore_deleted(b);
end;
$$;

-- --------------- the list ---------------

create or replace function public.deleted_items()
returns table (batch bigint, table_name text, record_id uuid, data jsonb, extra integer, deleted_at timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct on (t.batch)
    t.batch, t.table_name, t.record_id, t.data,
    (select count(*) from public.trash x where x.user_id = t.user_id and x.batch = t.batch)::integer - 1,
    t.deleted_at
  from public.trash t
  where t.user_id = auth.uid()
  order by t.batch, t.id
$$;

-- --------------- forgetting ---------------

create or replace function public.purge_deleted(p_batch bigint default null)
returns table (bucket text, path text)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with gone as (
    delete from public.trash t
    where t.user_id = auth.uid()
      and case when p_batch is null then t.deleted_at < now() - interval '30 days' else t.batch = p_batch end
    returning t.table_name, t.data
  ),
  files as (
    select 'entity-images'::text as bucket, coalesce(g.data->>'portrait_path', g.data->>'map_path', g.data->>'image_path') as path
    from gone g where g.table_name in ('npcs', 'player_characters', 'locations', 'handouts')
    union all
    select 'session-audio'::text, g.data->>'storage_path'
    from gone g where g.table_name in ('recording_tracks', 'recording_chunks')
  )
  select distinct f.bucket, f.path
  from files f
  where f.path is not null
    -- a file another record still uses stays (a detached copy keeps its portrait)
    and not exists (select 1 from public.npcs n where n.portrait_path = f.path)
    and not exists (select 1 from public.player_characters p where p.portrait_path = f.path)
    and not exists (select 1 from public.locations l where l.map_path = f.path)
    and not exists (select 1 from public.handouts h where h.image_path = f.path)
    and not exists (select 1 from public.recording_tracks rt where rt.storage_path = f.path)
    and not exists (select 1 from public.recording_chunks rc where rc.storage_path = f.path);
end;
$$;

revoke all on function public.restore_deleted(bigint) from public;
revoke all on function public.restore_record(text, uuid) from public;
revoke all on function public.deleted_items() from public;
revoke all on function public.purge_deleted(bigint) from public;
grant execute on function public.restore_deleted(bigint) to authenticated;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.deleted_items() to authenticated;
grant execute on function public.purge_deleted(bigint) to authenticated;
