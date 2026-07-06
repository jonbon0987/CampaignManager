-- ============================================================
-- Migration: worlds table + campaign world_id link
-- Run this in your Supabase SQL editor.
-- ============================================================

-- 1. Create worlds table
CREATE TABLE IF NOT EXISTS worlds (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  era         TEXT NOT NULL DEFAULT 'First Age',
  calendar    TEXT NOT NULL DEFAULT 'Year (Y)',
  year        INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own worlds"
  ON worlds FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER worlds_updated_at
  BEFORE UPDATE ON worlds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Add world_id to campaigns (nullable so existing rows aren't broken)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- 5. Add party, status, last_played to campaigns if missing
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS party TEXT NOT NULL DEFAULT '';

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'paused', 'completed'));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS last_played TEXT NOT NULL DEFAULT '';
