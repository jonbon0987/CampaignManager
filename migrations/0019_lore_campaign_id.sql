-- Add campaign_id to lore_entries so lore can be scoped to a campaign
ALTER TABLE lore_entries
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
