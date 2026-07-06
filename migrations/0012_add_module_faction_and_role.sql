-- ============================================================
-- Add faction association, node role, and threshold support
-- ============================================================
-- Run this in the Supabase SQL editor after add_module_dependencies.sql.
-- Requires modules, factions, and module_dependencies tables to exist.
-- ============================================================

-- Add faction_id to modules (color-codes nodes in the story web)
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS faction_id uuid REFERENCES public.factions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS modules_faction_id_idx ON public.modules(faction_id);

-- Add node_role to modules (start = opening mission, boss = final encounter)
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS node_role text CHECK (node_role IS NULL OR node_role IN ('start', 'boss'));

-- Add threshold to module_dependencies for "complete X of N" group gating
-- When present on an optional OR group, requires at least N prereqs completed.
-- NULL or 1 preserves existing "any 1 of N" behavior.
ALTER TABLE public.module_dependencies
  ADD COLUMN IF NOT EXISTS threshold integer CHECK (threshold IS NULL OR threshold >= 1);
