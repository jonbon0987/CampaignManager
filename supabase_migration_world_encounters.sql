-- Add world_id to encounters and make campaign_id optional
-- This allows encounter templates to live at the world level, independent of any campaign

ALTER TABLE encounters ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
ALTER TABLE encounters ALTER COLUMN campaign_id DROP NOT NULL;
