-- ============================================================
-- Migration: add world_id to global entity tables
-- (npcs, locations, lore_entries, factions, monster_statblocks)
--
-- Run this BEFORE supabase_migration_assign_global_entities_to_world.sql
-- Run in your Supabase SQL editor.
-- ============================================================

-- ── npcs ────────────────────────────────────────────────────
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- ── locations ───────────────────────────────────────────────
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- ── lore_entries ────────────────────────────────────────────
ALTER TABLE lore_entries
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- ── factions ────────────────────────────────────────────────
-- Make campaign_id nullable so factions can exist at the world level
ALTER TABLE factions
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE factions
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- ── monster_statblocks ──────────────────────────────────────
-- Make campaign_id nullable so statblocks can serve as a world bestiary
ALTER TABLE monster_statblocks
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE monster_statblocks
  ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;
