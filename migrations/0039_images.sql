-- ============================================================
-- Images: portraits, maps and handouts
-- ============================================================
-- The app had no images. This adds:
--
--   entity-images            a private storage bucket. Objects live under
--                            `<user_id>/…`, and the policies only let a user
--                            touch their own folder (as session-audio does).
--   npcs.portrait_path       a portrait for an NPC
--   player_characters.portrait_path
--   locations.map_path       a map for a region, town or site
--   handouts                 pictures to show the players, kept on a scene;
--                            Play shows them full-screen and Prep gathers them
--
-- Paths are storage object names in the bucket; the app shows them through
-- short-lived signed URLs.
-- ============================================================

-- --------------- entity-images storage bucket ---------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entity-images', 'entity-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "Users read own entity images"   on storage.objects;
drop policy if exists "Users upload own entity images" on storage.objects;
drop policy if exists "Users update own entity images" on storage.objects;
drop policy if exists "Users delete own entity images" on storage.objects;

create policy "Users read own entity images" on storage.objects
  for select using (bucket_id = 'entity-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload own entity images" on storage.objects
  for insert with check (bucket_id = 'entity-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update own entity images" on storage.objects
  for update using (bucket_id = 'entity-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own entity images" on storage.objects
  for delete using (bucket_id = 'entity-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- --------------- portraits and maps ---------------

alter table public.npcs add column if not exists portrait_path text;
alter table public.player_characters add column if not exists portrait_path text;
alter table public.locations add column if not exists map_path text;

-- --------------- handouts ---------------

create table if not exists public.handouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scene_id    uuid references public.scenes(id) on delete cascade,
  title       text not null default '',
  image_path  text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.handouts enable row level security;
drop policy if exists "Users manage own handouts" on public.handouts;
create policy "Users manage own handouts" on public.handouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists handouts_user_id_idx on public.handouts(user_id);
create index if not exists handouts_scene_id_idx on public.handouts(scene_id);
create index if not exists handouts_campaign_id_idx on public.handouts(campaign_id);
drop trigger if exists handouts_updated_at on public.handouts;
create trigger handouts_updated_at before update on public.handouts for each row execute function public.set_updated_at();

-- --------------- Field-length CHECK constraints ---------------
-- Mirrors src/lib/fieldLimits.ts.

alter table public.npcs drop constraint if exists npcs_portrait_path_len_chk;
alter table public.npcs add constraint npcs_portrait_path_len_chk check (char_length(portrait_path) <= 500) not valid;
alter table public.player_characters drop constraint if exists player_characters_portrait_path_len_chk;
alter table public.player_characters add constraint player_characters_portrait_path_len_chk check (char_length(portrait_path) <= 500) not valid;
alter table public.locations drop constraint if exists locations_map_path_len_chk;
alter table public.locations add constraint locations_map_path_len_chk check (char_length(map_path) <= 500) not valid;
alter table public.handouts drop constraint if exists handouts_title_len_chk;
alter table public.handouts add constraint handouts_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.handouts drop constraint if exists handouts_image_path_len_chk;
alter table public.handouts add constraint handouts_image_path_len_chk check (char_length(image_path) <= 500) not valid;
