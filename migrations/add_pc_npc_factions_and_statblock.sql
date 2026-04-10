-- Add faction_ids array and statblock_id FK to player_characters and npcs
ALTER TABLE public.player_characters ADD COLUMN faction_ids uuid[] DEFAULT '{}';
ALTER TABLE public.npcs ADD COLUMN faction_ids uuid[] DEFAULT '{}';

ALTER TABLE public.player_characters ADD COLUMN statblock_id uuid REFERENCES public.monster_statblocks(id) ON DELETE SET NULL;
ALTER TABLE public.npcs ADD COLUMN statblock_id uuid REFERENCES public.monster_statblocks(id) ON DELETE SET NULL;
