-- ============================================================
-- What happened at the table, saved as a session is played
-- ============================================================
-- Play mode keeps its state on the session itself, so a reload, a crash or
-- moving to another laptop picks up where the table left off, and the recap
-- can show what was noted during play.
--
--   play  { "started_at": iso, "ended_at": iso,
--           "scene_id": the agenda scene in play,
--           "fight": { "combatants": [...], "turn": n, "round": n },
--           "rolls": [{ "at": iso, "expr": "2d6+3", "total": n, "rolls": [...] }],
--           "notes": [{ "id": uuid, "at": iso, "text": "..." }] }
-- ============================================================

alter table public.sessions
  add column if not exists play jsonb not null default '{}'::jsonb;
