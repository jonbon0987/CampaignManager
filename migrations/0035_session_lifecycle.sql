-- ============================================================
-- One record per session, from plan to chronicle
-- ============================================================
-- A session moves planned → live → done. Its prep lives on the session itself
-- instead of a separate session_prep row keyed by number, so the plan and the
-- log can't drift apart.
--
--   title       a name for the session ("The Drowned Portico")
--   status      planned | live | done (existing sessions are done)
--   prep_notes  what session_prep.notes held
--   plan        links the prep picked: { "hook_ids": [...], "scene_ids": [...],
--               "encounter_ids": [...], "npc_ids": [...], "checklist": {...} }
-- ============================================================

alter table public.sessions
  add column if not exists title text,
  add column if not exists status text not null default 'done',
  add column if not exists prep_notes text,
  add column if not exists plan jsonb not null default '{}'::jsonb;

alter table public.sessions drop constraint if exists sessions_status_chk;
alter table public.sessions add constraint sessions_status_chk check (status in ('planned', 'live', 'done'));

-- Length CHECKs (mirror src/lib/fieldLimits.ts).
alter table public.sessions drop constraint if exists sessions_title_len_chk;
alter table public.sessions add constraint sessions_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.sessions drop constraint if exists sessions_prep_notes_len_chk;
alter table public.sessions add constraint sessions_prep_notes_len_chk check (char_length(prep_notes) <= 40000) not valid;

-- Fold session_prep into sessions.
-- 1. Prep for a session that exists: copy its notes and dangled threads across.
update public.sessions s
   set prep_notes = coalesce(nullif(s.prep_notes, ''), p.notes),
       plan = s.plan || jsonb_build_object('hook_ids', to_jsonb(p.dangled_hook_ids))
  from public.session_prep p
 where p.campaign_id = s.campaign_id
   and p.session_number = s.session_number;

-- 2. Prep for a session not logged yet: it becomes a planned session.
insert into public.sessions (user_id, campaign_id, session_number, session_date, status, prep_notes, plan)
select p.user_id, p.campaign_id, p.session_number, null, 'planned', p.notes,
       jsonb_build_object('hook_ids', to_jsonb(p.dangled_hook_ids))
  from public.session_prep p
 where not exists (
   select 1 from public.sessions s
    where s.campaign_id = p.campaign_id and s.session_number = p.session_number
 );

-- session_prep stays in place, no longer written, so the copy can be checked.
-- A later migration drops it.
