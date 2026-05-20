-- Assign all global entities with no world to "Forgotten Realms"

UPDATE npcs
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE campaign_id IS NULL AND world_id IS NULL;

UPDATE locations
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE campaign_id IS NULL AND world_id IS NULL;

UPDATE lore_entries
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE world_id IS NULL;

UPDATE factions
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE campaign_id IS NULL AND world_id IS NULL;

UPDATE monster_statblocks
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE campaign_id IS NULL AND world_id IS NULL;
