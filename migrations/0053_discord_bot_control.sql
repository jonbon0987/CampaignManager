-- ============================================================
-- Running the Discord bot from the app
-- ============================================================
-- The bot used to be started by hand (`npm run bot`) and was signed in to
-- Discord for as long as it ran. Now a small helper runs it in the background
-- (on the DM's Mac for now, started at login), and the app tells it what to do
-- through this row, so the same buttons will work wherever the bot ends up.
--
--   discord_bot_control       What the DM wants, written by the app:
--     online                  Signed in to Discord. A recording that asks for
--                             Discord signs it in too, whatever this says.
--     voice                   { guildId, channelId, channelName }: sit in this
--                             voice channel when not recording; null for none.
--
--   discord_bot_presence      What the bot reports (0033), and now:
--     helper_at               The helper's last report, signed in or not. Stale
--                             or null means nothing is running to take orders.
--     discord_status          offline | connecting | online | error
--     voice                   The voice channel it's sitting in, or null.
--     detail                  What it's doing, or why it couldn't.
--     heartbeat_at            Unchanged: refreshed only while signed in.
-- ============================================================

create table if not exists public.discord_bot_control (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  online      boolean not null default false,
  voice       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.discord_bot_control enable row level security;
drop policy if exists "Users manage own discord_bot_control" on public.discord_bot_control;
create policy "Users manage own discord_bot_control" on public.discord_bot_control
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists discord_bot_control_updated_at on public.discord_bot_control;
create trigger discord_bot_control_updated_at before update on public.discord_bot_control
  for each row execute function public.set_updated_at();

alter table public.discord_bot_control drop constraint if exists discord_bot_control_voice_chk;
alter table public.discord_bot_control add constraint discord_bot_control_voice_chk
  check (voice is null or (jsonb_typeof(voice) = 'object' and octet_length(voice::text) <= 1000)) not valid;

alter table public.discord_bot_presence add column if not exists helper_at timestamptz;
alter table public.discord_bot_presence add column if not exists discord_status text;
alter table public.discord_bot_presence add column if not exists voice jsonb;
alter table public.discord_bot_presence add column if not exists detail text;

alter table public.discord_bot_presence drop constraint if exists discord_bot_presence_status_chk;
alter table public.discord_bot_presence add constraint discord_bot_presence_status_chk
  check (discord_status is null or discord_status in ('offline', 'connecting', 'online', 'error')) not valid;
alter table public.discord_bot_presence drop constraint if exists discord_bot_presence_detail_len_chk;
alter table public.discord_bot_presence add constraint discord_bot_presence_detail_len_chk
  check (char_length(detail) <= 500) not valid;
