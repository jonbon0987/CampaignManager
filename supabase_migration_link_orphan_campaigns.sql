-- ============================================================
-- Migration: link existing campaigns (world_id IS NULL) to
-- a "Forgotten Realms" world, creating it if it doesn't exist.
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
  -- Single-user app: grab the first (and only) user.
  -- If you have multiple users, replace this with the specific UUID.
  SELECT id INTO v_user_id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found — make sure you are signed up before running this migration.';
  END IF;

  RAISE NOTICE 'Migrating for user: %', v_user_id;

  -- ── 2. Find or create the Forgotten Realms world ───────────
  SELECT id INTO v_world_id
  FROM worlds
  WHERE user_id = v_user_id
    AND name = 'Forgotten Realms'
  LIMIT 1;

  IF v_world_id IS NULL THEN
    INSERT INTO worlds (user_id, name, tagline, era, calendar, year, sort_order)
    VALUES (
      v_user_id,
      'Forgotten Realms',
      'The iconic D&D setting where heroes are forged and legends are made.',
      'Current Era',
      'Year (DR)',
      1492,
      0
    )
    RETURNING id INTO v_world_id;

    RAISE NOTICE 'Created world "Forgotten Realms" with id: %', v_world_id;
  ELSE
    RAISE NOTICE 'Found existing world "Forgotten Realms" with id: %', v_world_id;
  END IF;

  -- ── 3. Link orphaned campaigns to Forgotten Realms ─────────
  UPDATE campaigns
  SET world_id = v_world_id
  WHERE user_id  = v_user_id
    AND world_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Linked % campaign(s) to "Forgotten Realms".', v_count;
END $$;
