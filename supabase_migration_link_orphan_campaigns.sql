-- Link all campaigns with no world to "Forgotten Realms"
UPDATE campaigns
SET world_id = (SELECT id FROM worlds WHERE name = 'Forgotten Realms' LIMIT 1)
WHERE world_id IS NULL;
