-- ════════════════════════════════════════════════════════════════
-- OPTIONAL, best-effort migration: rewrite legacy inline entity links
--   [[kind:uuid:Name]]  ->  @[Name](kind:uuid)
-- and remap the legacy `creature` kind to `statblock`.
--
-- This is NOT required to ship: the app parses BOTH formats at read
-- time (see src/lib/slashMarkdown.ts → refRegex) and rewrites a field
-- to the new format the next time it is saved. Run this only if you
-- want to normalize stored content in bulk. REVIEW before running and
-- take a backup first.
--
-- Notes:
--  * Legacy links without a display name become @[](kind:uuid); the UI
--    resolves the label from the entity index, so an empty label is fine.
--  * Postgres regexp_replace has no conditional replacement, so we do the
--    name rewrite first, then a second pass to remap `creature`->`statblock`.
-- ════════════════════════════════════════════════════════════════

-- Reusable expression applied per column:
--   pass 1: [[kind:uuid:Name]] -> @[Name](kind:uuid)   (Name optional)
--   pass 2: @[..](creature:uuid) -> @[..](statblock:uuid)
-- Helper macro is inlined per UPDATE below.

DO $$
DECLARE
  -- table -> array of text columns that may contain references
  rec record;
  pass1 constant text := '\[\[(creature|npc|location|session|faction|hook):([a-f0-9-]{36})(?::([^\]]*))?\]\]';
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('npcs',               ARRAY['description','hooks_motivations','dm_notes']),
      ('locations',          ARRAY['description','history','dm_notes']),
      ('factions',           ARRAY['overview','key_figures','agenda','dm_notes']),
      ('lore_entries',       ARRAY['content']),
      ('hooks',              ARRAY['description','dm_only_notes']),
      ('modules',            ARRAY['synopsis','encounters','rewards','dm_notes']),
      ('submodules',         ARRAY['summary','content','dm_notes']),
      ('sessions',           ARRAY['summary','combats','loot_rewards','hooks_notes','dm_notes']),
      ('session_preps',      ARRAY['notes']),
      ('monster_statblocks', ARRAY['content','dm_notes']),
      ('player_characters',  ARRAY['background','story_hooks','key_npcs','dm_notes']),
      ('world_encounters',   ARRAY['notes']),
      ('timeline_events',    ARRAY['description'])
    ) AS t(tbl text, cols text[])
  LOOP
    DECLARE col text;
    BEGIN
      FOREACH col IN ARRAY rec.cols LOOP
        -- Skip silently if the table/column does not exist in this schema.
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = rec.tbl AND column_name = col
        ) THEN
          EXECUTE format(
            'UPDATE public.%I
                SET %I = regexp_replace(
                           regexp_replace(%I, %L, %L, ''g''),
                           ''@\[([^\]]*)\]\(creature:'', ''@[\1](statblock:'', ''g'')
              WHERE %I ~ %L',
            rec.tbl, col, col, pass1, '@[\3](\1:\2)', col, pass1
          );
        END IF;
      END LOOP;
    END;
  END LOOP;
END $$;
