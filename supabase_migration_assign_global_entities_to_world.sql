-- ============================================================
-- Migration: assign existing global entities to Forgotten Realms
--
-- Targets records that have no world_id and are "global"
-- (campaign_id IS NULL, or no campaign_id column at all).
--
-- Run AFTER supabase_migration_add_world_id_to_entities.sql
-- Run in your Supabase SQL editor.
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

  RAISE NOTICE 'Assigning global entities for user: %', v_user_id;

  -- ── 2. Resolve the Forgotten Realms world ──────────────────
  SELECT id INTO v_world_id
  FROM worlds
  WHERE user_id = v_user_id
    AND name    = 'Forgotten Realms'
  LIMIT 1;

  IF v_world_id IS NULL THEN
    -- Create it if the campaigns migration hasn't run yet
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
    RAISE NOTICE 'Created world "Forgotten Realms": %', v_world_id;
  ELSE
    RAISE NOTICE 'Found world "Forgotten Realms": %', v_world_id;
  END IF;

  -- ── 3. Global NPCs (campaign_id IS NULL) ───────────────────
  UPDATE npcs
  SET world_id = v_world_id
  WHERE user_id    = v_user_id
    AND campaign_id IS NULL
    AND world_id   IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'NPCs linked: %', v_count;

  -- ── 4. Global Locations (campaign_id IS NULL) ──────────────
  UPDATE locations
  SET world_id = v_world_id
  WHERE user_id    = v_user_id
    AND campaign_id IS NULL
    AND world_id   IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Locations linked: %', v_count;

  -- ── 5. Lore entries (no campaign scoping at all) ───────────
  UPDATE lore_entries
  SET world_id = v_world_id
  WHERE user_id  = v_user_id
    AND world_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Lore entries linked: %', v_count;

  -- ── 6. World-level Factions (campaign_id IS NULL) ──────────
  UPDATE factions
  SET world_id = v_world_id
  WHERE user_id    = v_user_id
    AND campaign_id IS NULL
    AND world_id   IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Factions (world-level) linked: %', v_count;

  -- ── 7. World-level Monster Statblocks (campaign_id IS NULL) ─
  UPDATE monster_statblocks
  SET world_id = v_world_id
  WHERE user_id    = v_user_id
    AND campaign_id IS NULL
    AND world_id   IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Monster statblocks (world-level) linked: %', v_count;

END $$;
