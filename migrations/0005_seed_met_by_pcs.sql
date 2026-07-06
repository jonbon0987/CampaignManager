-- Backfill met_by_pcs for NPCs the party has already encountered (Sessions 1–4).
--
-- MET (direct PC interaction confirmed in session notes):
--   Gorg Grimfang      — crew captain since Session 1
--   Torbo              — first mate since Session 1
--   Thresh             — Gutted Eel proprietor, home base since Session 1
--   Cob Wrenwick       — interrogated before the Duskward dive, Session 3; blackmailed Session 3
--   Garth Two-Fingers  — caught Craren cheating, arranged pit fight, Session 2
--   Finn               — Mara spotted him at her stall; Kutter recognized his technique, Session 2
--   Madge              — Kutter & Mara visited her shop, Session 4
--   The Trash Lurker   — negotiation + ceremonial lick, Session 4
--   Tuck               — Mittens met him at the Rendering Yard, Session 2
--   Pip                — introduced herself to Exius in Skarport, Session 2
--   Salo               — Mortecai rescued and healed her, Session 2
--   Scratch Vellum     — party interfered with his collector (Exius standoff), Session 4
--   Aldric Voss        — sat in Kutter's barber chair, Session 2
--
-- NOT MET (no direct PC encounter through Session 4):
--   Princess Lilith Kaldani  — in Arborath; first_session is null
--   Darius                   — in Arborath; first_session is null
--   Malachi The Mage         — in Arborath; first_session is null
--   Mingo                    — location unknown; no session encounter recorded

UPDATE npcs
SET met_by_pcs = TRUE
WHERE name IN (
  'Gorg Grimfang',
  'Torbo',
  'Thresh',
  'Cob Wrenwick',
  'Garth Two-Fingers',
  'Finn',
  'Madge',
  'The Trash Lurker',
  'Tuck',
  'Pip',
  'Salo',
  'Scratch Vellum',
  'Aldric Voss'
);
