-- ============================================================
-- Session recording & transcription
-- ============================================================
-- Storage for recording a session (table mic + Discord), transcribing it, and
-- routing what happened back into the campaign after the DM reviews it.
--
--   session_recordings      one recording of one session (status, settings)
--   recording_tracks        one audio source: the table mic, one Discord player,
--                           or an uploaded file
--   recording_chunks        the ~5-minute pieces a track is uploaded in
--   transcript_segments     transcribed lines, with speaker → PC mapping
--   recording_moments       moments the DM marked while recording
--   speaker_links           Discord account → PC, remembered per campaign
--   player_consents         per-PC recording consent, per campaign
--   chronicle_proposals     proposed changes awaiting the DM's review
--   chronicle_applied       before-snapshots of applied changes (for undo)
--   entity_session_entries  per-entity "Session History" lines
--
-- Also adds npcs.disposition and a private `session-audio` storage bucket whose
-- objects live under `<user_id>/…`.
--
-- Every table carries user_id and the owner-only RLS policy used elsewhere
-- (see 0027): the app talks to Supabase with the anon key, so RLS is the only
-- thing keeping one user's recordings from another.
-- ============================================================

-- --------------- npcs.disposition ---------------

alter table public.npcs
  add column if not exists disposition text;   -- the NPC's attitude toward the party

-- --------------- session_recordings ---------------

create table if not exists public.session_recordings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  session_id        uuid not null references public.sessions(id) on delete cascade,
  status            text not null default 'recording'
                    check (status in ('recording', 'uploading', 'processing', 'review', 'applied', 'failed', 'cancelled')),
  status_detail     text,                                   -- current step or error message
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_ms       integer,
  settings          jsonb not null default '{}'::jsonb,     -- RecordingSettings (see database.types.ts)
  audio_expires_at  timestamptz,                            -- null = keep forever
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- --------------- recording_tracks ---------------

create table if not exists public.recording_tracks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  recording_id          uuid not null references public.session_recordings(id) on delete cascade,
  source                text not null check (source in ('table', 'discord', 'upload')),
  label                 text,                               -- "Table mic", a Discord username, a filename
  discord_user_id       text,                               -- set for source = 'discord'
  pc_id                 uuid references public.player_characters(id) on delete set null,
  offset_ms             integer not null default 0,         -- track start relative to the recording start
  storage_path          text,                               -- the joined full-length file, once assembled
  mime_type             text,
  duration_ms           integer,
  transcription_status  text not null default 'pending'
                        check (transcription_status in ('pending', 'submitted', 'done', 'failed')),
  transcription_job_id  text,                               -- the speech-to-text provider's job id
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --------------- recording_chunks ---------------

create table if not exists public.recording_chunks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  track_id      uuid not null references public.recording_tracks(id) on delete cascade,
  seq           integer not null,                           -- 0-based order within the track
  storage_path  text not null,
  start_ms      integer not null default 0,                 -- relative to the track start
  duration_ms   integer,
  byte_size     integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (track_id, seq)
);

-- --------------- transcript_segments ---------------

create table if not exists public.transcript_segments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  recording_id     uuid not null references public.session_recordings(id) on delete cascade,
  track_id         uuid not null references public.recording_tracks(id) on delete cascade,
  start_ms         integer not null,                        -- relative to the recording start
  end_ms           integer not null,
  speaker_label    text,                                    -- provider label ("A", "B") or Discord name
  pc_id            uuid references public.player_characters(id) on delete set null,
  is_dm            boolean not null default false,
  text             text not null,
  dropped_as_echo  boolean not null default false,          -- table-mic copy of a Discord line
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- --------------- recording_moments ---------------

create table if not exists public.recording_moments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  recording_id  uuid not null references public.session_recordings(id) on delete cascade,
  at_ms         integer not null,
  label         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------- speaker_links ---------------

create table if not exists public.speaker_links (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  discord_user_id   text not null,
  discord_username  text,
  pc_id             uuid references public.player_characters(id) on delete cascade,
  is_dm             boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (campaign_id, discord_user_id)
);

-- --------------- player_consents ---------------

create table if not exists public.player_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  pc_id         uuid not null references public.player_characters(id) on delete cascade,
  consented_at  timestamptz not null default now(),
  method        text check (method in ('in_person', 'discord', 'other')),
  revoked_at    timestamptz,                                -- set when a player withdraws consent
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, pc_id)
);

-- --------------- chronicle_proposals ---------------

create table if not exists public.chronicle_proposals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  recording_id    uuid not null references public.session_recordings(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  group_key       text not null,                            -- review grouping: session | pcs | npcs | …
  action          jsonb not null,                           -- the proposed change (ImportAction shape)
  edits           jsonb,                                    -- the DM's overrides, applied over `action`
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'skipped', 'applied')),
  source_ms       integer,                                  -- where in the recording it came from
  source_quote    text,
  source_speaker  text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- --------------- chronicle_applied ---------------

create table if not exists public.chronicle_applied (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  recording_id  uuid not null references public.session_recordings(id) on delete cascade,
  proposal_id   uuid references public.chronicle_proposals(id) on delete set null,
  entity_table  text not null,                              -- e.g. 'npcs', 'entity_session_entries'
  entity_id     uuid not null,
  operation     text not null check (operation in ('create', 'update')),
  before        jsonb,                                      -- row before the update; null for a create
  applied_at    timestamptz not null default now(),
  undone_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------- entity_session_entries ---------------

create table if not exists public.entity_session_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  recording_id  uuid references public.session_recordings(id) on delete set null,
  entity_type   text not null check (entity_type in ('pc', 'npc', 'location', 'faction', 'lore', 'hook')),
  entity_id     uuid not null,                              -- polymorphic: no FK
  text          text not null,
  source_ms     integer,
  source_quote  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- --------------- RLS, indexes, updated_at triggers ---------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'session_recordings', 'recording_tracks', 'recording_chunks', 'transcript_segments',
    'recording_moments', 'speaker_links', 'player_consents', 'chronicle_proposals',
    'chronicle_applied', 'entity_session_entries'
  ]
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

create index if not exists session_recordings_session_id_idx      on public.session_recordings(session_id);
create index if not exists session_recordings_campaign_id_idx     on public.session_recordings(campaign_id);
create index if not exists recording_tracks_recording_id_idx      on public.recording_tracks(recording_id);
create index if not exists transcript_segments_recording_start_idx on public.transcript_segments(recording_id, start_ms);
create index if not exists recording_moments_recording_id_idx     on public.recording_moments(recording_id);
create index if not exists player_consents_campaign_id_idx        on public.player_consents(campaign_id);
create index if not exists chronicle_proposals_recording_id_idx   on public.chronicle_proposals(recording_id);
create index if not exists chronicle_applied_recording_id_idx     on public.chronicle_applied(recording_id);
create index if not exists entity_session_entries_entity_idx      on public.entity_session_entries(entity_type, entity_id);
create index if not exists entity_session_entries_session_id_idx  on public.entity_session_entries(session_id);

-- --------------- Field-length CHECK constraints ---------------
-- Mirrors src/lib/fieldLimits.ts. Folded in here rather than regenerating 0028
-- (which is already applied).

alter table public.npcs drop constraint if exists npcs_disposition_len_chk;
alter table public.npcs add constraint npcs_disposition_len_chk check (char_length(disposition) <= 120) not valid;

alter table public.session_recordings add constraint session_recordings_status_detail_len_chk check (char_length(status_detail) <= 500) not valid;

alter table public.recording_tracks add constraint recording_tracks_label_len_chk                check (char_length(label) <= 120)                not valid;
alter table public.recording_tracks add constraint recording_tracks_discord_user_id_len_chk      check (char_length(discord_user_id) <= 60)       not valid;
alter table public.recording_tracks add constraint recording_tracks_storage_path_len_chk         check (char_length(storage_path) <= 500)         not valid;
alter table public.recording_tracks add constraint recording_tracks_mime_type_len_chk            check (char_length(mime_type) <= 60)             not valid;
alter table public.recording_tracks add constraint recording_tracks_transcription_job_id_len_chk check (char_length(transcription_job_id) <= 120) not valid;

alter table public.recording_chunks add constraint recording_chunks_storage_path_len_chk check (char_length(storage_path) <= 500) not valid;

alter table public.transcript_segments add constraint transcript_segments_speaker_label_len_chk check (char_length(speaker_label) <= 120) not valid;
alter table public.transcript_segments add constraint transcript_segments_text_len_chk          check (char_length(text) <= 8000)         not valid;

alter table public.recording_moments add constraint recording_moments_label_len_chk check (char_length(label) <= 240) not valid;

alter table public.speaker_links add constraint speaker_links_discord_user_id_len_chk  check (char_length(discord_user_id) <= 60)   not valid;
alter table public.speaker_links add constraint speaker_links_discord_username_len_chk check (char_length(discord_username) <= 120) not valid;

alter table public.chronicle_proposals add constraint chronicle_proposals_group_key_len_chk      check (char_length(group_key) <= 60)       not valid;
alter table public.chronicle_proposals add constraint chronicle_proposals_source_quote_len_chk   check (char_length(source_quote) <= 8000)  not valid;
alter table public.chronicle_proposals add constraint chronicle_proposals_source_speaker_len_chk check (char_length(source_speaker) <= 120) not valid;

alter table public.chronicle_applied add constraint chronicle_applied_entity_table_len_chk check (char_length(entity_table) <= 60) not valid;

alter table public.entity_session_entries add constraint entity_session_entries_text_len_chk         check (char_length(text) <= 8000)         not valid;
alter table public.entity_session_entries add constraint entity_session_entries_source_quote_len_chk check (char_length(source_quote) <= 8000) not valid;

-- --------------- session-audio storage bucket ---------------
-- Private. Objects are stored under `<user_id>/<recording_id>/…`, and the
-- policies below only let a user touch objects in their own top-level folder.

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'session-audio', 'session-audio', false,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do nothing;

drop policy if exists "Users read own session audio"   on storage.objects;
drop policy if exists "Users upload own session audio" on storage.objects;
drop policy if exists "Users update own session audio" on storage.objects;
drop policy if exists "Users delete own session audio" on storage.objects;

create policy "Users read own session audio" on storage.objects
  for select using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload own session audio" on storage.objects
  for insert with check (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update own session audio" on storage.objects
  for update using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own session audio" on storage.objects
  for delete using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);
