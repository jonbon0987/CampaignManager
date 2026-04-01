-- Add met_by_pcs column to npcs table
-- Tracks whether the party has encountered this NPC yet

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS met_by_pcs BOOLEAN NOT NULL DEFAULT FALSE;
