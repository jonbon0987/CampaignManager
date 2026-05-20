-- ============================================================
-- Migration: link existing campaigns (world_id IS NULL) to
-- the existing "Forgotten Realms" world.
--
-- Run this in your Supabase SQL editor.
-- ============================================================

DO $$
DECLARE
  v_user_id  UUID;
  v_world_id UUID;
  v_count    INT;
BEGIN
  -- ── 1. Resolve the user ────────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found.';
  END IF;

  -- ── 2. Find the Forgotten Realms world ─────────────────────
  SELECT id INTO v_world_id
  FROM worlds
  WHERE user_id = v_user_id
    AND name    = 'Forgotten Realms'
  LIMIT 1;

  IF v_world_id IS NULL THEN
    RAISE EXCEPTION 'World "Forgotten Realms" not found — create it in the app first.';
  END IF;

  RAISE NOTICE 'Linking to world: %', v_world_id;

  -- ── 3. Link orphaned campaigns ─────────────────────────────
  UPDATE campaigns
  SET world_id = v_world_id
  WHERE user_id  = v_user_id
    AND world_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Linked % campaign(s) to "Forgotten Realms".', v_count;
END $$;
