-- Move all lore entries to "The Age of Wild Magic" campaign
UPDATE lore_entries
SET campaign_id = (SELECT id FROM campaigns WHERE name = 'The Age of Wild Magic' LIMIT 1),
    world_id    = NULL
WHERE campaign_id IS NULL;
