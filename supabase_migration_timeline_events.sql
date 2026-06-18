-- ============================================================
-- Migration: timeline_events table
-- Run this in your Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  world_id    UUID REFERENCES worlds(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT,
  year        INTEGER NOT NULL DEFAULT 0,
  display_date TEXT NOT NULL DEFAULT '',
  event_type  TEXT NOT NULL DEFAULT 'custom',
  era         TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own timeline_events"
  ON timeline_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER timeline_events_updated_at
  BEFORE UPDATE ON timeline_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
