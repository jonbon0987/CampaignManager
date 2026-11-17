// Encounter data shared by the builder, the world combat view, prep sheets and
// the combat tracker. Kept out of the components so those files export only
// components (React Fast Refresh needs that).
import type { EncounterCombatant } from './database.types';

// Minimal data shape the save callback receives — callers inject campaign_id / world_id themselves
export type EncounterSaveData = {
  id?: string;
  name: string;
  description: string | null;
  environment: string | null;
  difficulty: string | null;
  party_size: number | null;
  party_level: number | null;
  dm_notes: string | null;
  status: 'draft' | 'ready' | 'completed';
  combatants: string | null;
  sort_order: number;
};

/** An encounter's creature list, from its stored JSON. Bad or empty JSON gives none. */
export function parseCombatants(raw: string | null): EncounterCombatant[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as EncounterCombatant[]; }
  catch { return []; }
}
