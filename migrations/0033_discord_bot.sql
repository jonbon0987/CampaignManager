-- ============================================================
-- 0033 — Discord voice for session recordings (phase 7)
--
-- The Discord bot (bot/) is a separate long-running process. It and the app
-- never talk directly: they meet in these rows.
--   * discord_bot_presence — the bot's heartbeat and the voice/text channels it
--     can see (and who is in them), so the app can offer a channel to record.
--   * session_recordings.discord_* — the app asks for Discord by putting a
--     channel in settings.discord; the bot reports how capture is going here.
--     paused_at mirrors the app's Pause so the bot stops capturing too.
--   * discord_posts — an outbox: the app queues a message (the player recap),
--     the bot sends it and marks it sent.
-- ============================================================

-- --------------- session_recordings ---------------

alter table public.session_recordings
  add column if not exists paused_at      timestamptz,       -- set while the DM has paused the recording
  add column if not exists discord_state  text
    check (discord_state in ('connecting', 'recording', 'finishing', 'done', 'failed')),
  add column if not exists discord_detail text;              -- what the bot is doing, or why it failed

-- --------------- discord_bot_presence ---------------

create table if not exists public.discord_bot_presence (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  bot_tag       text,                                       -- "Lair#1234"
  heartbeat_at  timestamptz not null default now(),
  guilds        jsonb not null default '[]'::jsonb,         -- DiscordGuild[] (see database.types.ts)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------- discord_posts ---------------

create table if not exists public.discord_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  recording_id  uuid references public.session_recordings(id) on delete set null,
  channel_id    text not null,
  content       text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------- RLS, indexes, updated_at triggers ---------------

do $$
declare
  t text;
begin
  foreach t in array array['discord_bot_presence', 'discord_posts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users manage own %s" on public.%I', t, t);
    execute format(
      'create policy "Users manage own %s" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
    execute format('create index if not exists %I on public.%I(user_id)', t || '_user_id_idx', t);
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_updated_at', t
    );
  end loop;
end $$;

create index if not exists discord_posts_pending_idx on public.discord_posts(user_id) where status = 'pending';

-- --------------- Field-length CHECK constraints (mirror fieldLimits.ts) ---------------

alter table public.session_recordings add constraint session_recordings_discord_detail_len_chk check (char_length(discord_detail) <= 500) not valid;

alter table public.discord_bot_presence add constraint discord_bot_presence_bot_tag_len_chk check (char_length(bot_tag) <= 120) not valid;

alter table public.discord_posts add constraint discord_posts_channel_id_len_chk check (char_length(channel_id) <= 60)   not valid;
alter table public.discord_posts add constraint discord_posts_content_len_chk    check (char_length(content) <= 8000)    not valid;
alter table public.discord_posts add constraint discord_posts_error_len_chk      check (char_length(error) <= 500)       not valid;
