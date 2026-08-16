// worldSeeds.ts
// ---------------------------------------------------------------------------
// Content used by the First-World Gate's non-scratch paths.
//
//  • EXAMPLE_WORLDS — three prebuilt settings offered on the "Use a prebuilt
//    example" panel. Each carries a curated starter set of factions, locations,
//    NPCs, and lore. The card counts shown in the gate are derived from these
//    arrays (see exampleCounts), so the advertised numbers always match what
//    actually gets seeded.
//  • seedWorldEntities — inserts a WorldSeed against a world_id via the same
//    db helpers the app uses everywhere else (RLS/user_id handled there).
//  • importActionsToSeed — maps the world-relevant subset of parsed import
//    actions into a WorldSeed, so the Import path can stage real content.
// ---------------------------------------------------------------------------

import {
  NPCs as NPCsDB,
  Factions as FactionsDB,
  Locations as LocationsDB,
  Lore as LoreDB,
} from './db';
import { entityMeta, type ImportAction } from './documentImport';

export interface SeedFaction {
  name: string;
  faction_type?: string | null;
  overview?: string | null;
}

export interface SeedLocation {
  name: string;
  location_type?: string | null;
  region?: string | null;
  description?: string | null;
}

export interface SeedNPC {
  name: string;
  role?: string | null;
  status?: 'active' | 'deceased' | 'unknown';
  description?: string | null;
  location?: string | null;
}

export interface SeedLore {
  title: string;
  category?: string | null;
  content?: string | null;
}

export interface WorldSeed {
  factions: SeedFaction[];
  locations: SeedLocation[];
  npcs: SeedNPC[];
  lore: SeedLore[];
}

export interface ExampleWorld {
  id: string;
  name: string;
  tagline: string;
  seed: WorldSeed;
}

/** Total entity count for a seed — used for the "N created" landing note. */
export function seedTotal(seed: WorldSeed): number {
  return seed.factions.length + seed.locations.length + seed.npcs.length + seed.lore.length;
}

// ── Prebuilt example worlds ────────────────────────────────────────────────

export const EXAMPLE_WORLDS: ExampleWorld[] = [
  {
    id: 'amber',
    name: 'The Amber Waste',
    tagline: 'Feuding caravan-cities and buried gods beneath an unblinking sun.',
    seed: {
      factions: [
        { name: 'The Gilded Compact', faction_type: 'Merchant League', overview: 'The caravan-masters and water-brokers who own every viable route across the Waste. Whoever holds the wells holds the desert, and the Compact holds the wells.' },
        { name: 'The Redsand Reavers', faction_type: 'Raiders', overview: 'Dune-riders who prey on the long caravans and melt back into the heat-haze. Some swear they guard the old tombs more fiercely than they rob the living.' },
      ],
      locations: [
        { name: 'Zuhra', location_type: 'city', region: 'The Waste', description: 'The great walled caravan-city at the last true oasis. Every road in the Waste ends at its gates, and every debt eventually follows.' },
        { name: 'The Glass Flats', location_type: 'landmark', region: 'The Waste', description: 'A salt-and-glass plain where a falling star fused the sand to mirror. Caravans cross only by night; by day it blinds and it lies.' },
        { name: 'The Hollow Kings\' Tombs', location_type: 'dungeon', region: 'The Deep Dunes', description: 'A necropolis of god-kings buried alive with their cities\' water, sunk beneath the shifting dunes and waiting out the centuries.' },
        { name: 'Marrow Wells', location_type: 'town', region: 'The Waste', description: 'A hardscrabble well-town where water is the only currency that matters and everyone, child or elder, goes armed to the cistern.' },
      ],
      npcs: [
        { name: 'Vizier Amsa Dukhal', role: 'Water-broker of Zuhra', status: 'active', description: 'Controls the city\'s cisterns and therefore its politics. Smiles far more often than she means it, and never for free.', location: 'Zuhra' },
        { name: 'Kefri the Long Road', role: 'Caravan-master', status: 'active', description: 'Has crossed the Glass Flats more times than anyone still breathing. Owes a debt in every city and a favor in none.', location: 'Zuhra' },
        { name: 'The Veiled One', role: 'Reaver tomb-guide', status: 'unknown', description: 'Leads the desperate down into the Hollow Kings\' tombs for a price. Not everyone who follows the veil comes all the way back up.', location: 'The Hollow Kings\' Tombs' },
      ],
      lore: [
        { title: 'The Unblinking Sun', category: 'religion', content: 'In high summer the sun never fully sets over the Waste. The old faiths hold that it is a god that refuses to close its eye — and that it is watching for something.' },
        { title: 'The Hollow Kings', category: 'history', content: 'God-kings who had themselves entombed alive with all their cities\' water, vowing to rise again when the last well ran dry. The wells are running dry.' },
      ],
    },
  },
  {
    id: 'ember',
    name: 'Emberhold',
    tagline: 'A dwarven hold clinging to the lip of a slumbering flame.',
    seed: {
      factions: [
        { name: 'The Cinderguard', faction_type: 'Military', overview: 'The hold\'s standing garrison, sworn to keep the Deep Vent sealed and the outer gates manned.' },
        { name: 'Forgemasters\' Conclave', faction_type: 'Guild', overview: 'The seven master-smiths whose votes decide what the hold builds, burns, and forbids.' },
      ],
      locations: [
        { name: 'The Great Hearth', location_type: 'landmark', region: 'Emberhold', description: 'A cathedral of worked stone around a flame that predates the hold. Its warmth is law; its silence, an omen.' },
        { name: 'The Deep Vent', location_type: 'dungeon', region: 'Emberhold', description: 'A sealed shaft down toward the slumbering fire. Something below has begun, very slowly, to knock.' },
        { name: 'Ashmarket', location_type: 'city', region: 'Emberhold', description: 'The tiered trade-caverns where surface-folk are tolerated, taxed, and watched.' },
      ],
      npcs: [
        { name: 'Thane Durga Emberkin', role: 'Ruler of the hold', status: 'active', description: 'Holds the oldest seat by right and the newest doubts by night. Fears the flame is waking.', location: 'The Great Hearth' },
        { name: 'Vashk', role: 'Cinderguard sergeant', status: 'active', description: 'Blunt, scarred, and the only officer who will say aloud that the Vent should never have been sealed.', location: 'The Deep Vent' },
        { name: 'Old Pell', role: 'Hearth-tender', status: 'active', description: 'Has fed the Great Hearth for sixty years and swears it has started to answer back.', location: 'The Great Hearth' },
      ],
      lore: [
        { title: 'The Slumbering Flame', category: 'religion', content: 'Emberhold was raised over a fire the founders could neither douse nor understand. The hold\'s first commandment: let it sleep.' },
        { title: 'The Sealing of the Vent', category: 'history', content: 'Three generations past, the Conclave walled off the Deep Vent after a crew went down and did not come up. No one alive remembers the vote clearly.' },
      ],
    },
  },
  {
    id: 'tide',
    name: 'The Sunless Tide',
    tagline: 'Drowned cities and coral spires beneath an endless sea.',
    seed: {
      factions: [
        { name: 'The Tide Court', faction_type: 'Theocracy', overview: 'The coral-throned priesthood that bargains with the deep on behalf of the living. Its favor moves with the currents.' },
        { name: 'The Salt-Bound', faction_type: 'Cult', overview: 'Those who took the Salt Pact and no longer need to surface. What they want on land, they no longer say.' },
      ],
      locations: [
        { name: 'Thessaly Deep', location_type: 'city', region: 'The Tide', description: 'A sunken capital of glass and coral, lit by drifting shoals of witch-light. Half its districts are flooded; the other half worse.' },
        { name: 'The Coral Wards', location_type: 'landmark', region: 'Thessaly Deep', description: 'Living reef grown into ramparts. It heals its own breaches — and remembers who caused them.' },
        { name: 'The Drowned Catacombs', location_type: 'dungeon', region: 'Thessaly Deep', description: 'Where the Tide Court files its dead and its debts. The Deep Choir is loudest here.' },
        { name: 'The Marooned Envoy\'s Wreck', location_type: 'landmark', region: 'The Tide', description: 'A surface ship pinned to a spire, kept as an embassy and a warning both.' },
      ],
      npcs: [
        { name: 'Tide-Priest Ossian', role: 'Voice of the Tide Court', status: 'active', description: 'Speaks the Court\'s bargains aloud so the living can hear their price. Increasingly, he hesitates before he does.', location: 'Thessaly Deep' },
        { name: 'Naia Vess', role: 'Smuggler of dry goods', status: 'active', description: 'Runs surface air and sunlight down to those who still crave them. Owes the Salt-Bound a favor she can\'t name.', location: 'The Coral Wards' },
        { name: 'The Marooned Envoy', role: 'Surface ambassador', status: 'unknown', description: 'The last dry-lander the Deep permits to breathe. No longer certain which side she serves.', location: 'The Marooned Envoy\'s Wreck' },
      ],
      lore: [
        { title: 'The Drowning', category: 'history', content: 'The sea did not rise so much as decide. In a single tideless night the coast went under, and the cities that mattered simply kept going.' },
        { title: 'The Salt Pact', category: 'magic', content: 'Swallow the salt and the water stops being your enemy — and stops being water. The Pact is easy to take and impossible to spit out.' },
      ],
    },
  },
];

/** Card meta counts, derived so the UI can never drift from the seed. */
export function exampleCounts(w: ExampleWorld) {
  return {
    loc: w.seed.locations.length,
    npc: w.seed.npcs.length,
    fac: w.seed.factions.length,
    lore: w.seed.lore.length,
  };
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * Insert a WorldSeed's entities against a world. Factions are inserted first so
 * NPCs could be linked later if desired. Best-effort per row: a single failed
 * insert is logged and skipped rather than aborting the whole seed — the world
 * itself already exists by the time this runs.
 */
export async function seedWorldEntities(worldId: string, seed: WorldSeed): Promise<void> {
  for (const f of seed.factions) {
    try {
      await FactionsDB.upsert({
        world_id: worldId,
        campaign_id: null,
        name: f.name,
        faction_type: f.faction_type ?? null,
        overview: f.overview ?? null,
        key_figures: null,
        agenda: null,
        dm_notes: null,
      });
    } catch (e) { console.error('seedWorldEntities: faction insert failed', f.name, e); }
  }

  for (const l of seed.locations) {
    try {
      await LocationsDB.upsert({
        world_id: worldId,
        campaign_id: null,
        name: l.name,
        location_type: l.location_type ?? 'landmark',
        region: l.region ?? null,
        parent_id: null,
        population: null,
        status: null,
        description: l.description ?? null,
        history: null,
        dm_notes: null,
      });
    } catch (e) { console.error('seedWorldEntities: location insert failed', l.name, e); }
  }

  for (const n of seed.npcs) {
    try {
      await NPCsDB.upsert({
        world_id: worldId,
        campaign_id: null,
        name: n.name,
        role: n.role ?? null,
        status: n.status ?? 'active',
        description: n.description ?? null,
        hooks_motivations: null,
        dm_notes: null,
        location: n.location ?? null,
        affiliation: null,
        first_session: null,
        met_by_pcs: false,
        faction_ids: [],
        statblock_id: null,
      });
    } catch (e) { console.error('seedWorldEntities: npc insert failed', n.name, e); }
  }

  for (const entry of seed.lore) {
    try {
      await LoreDB.upsert({
        world_id: worldId,
        campaign_id: null,
        title: entry.title,
        category: entry.category ?? null,
        content: entry.content ?? null,
        dm_only: false,
      });
    } catch (e) { console.error('seedWorldEntities: lore insert failed', entry.title, e); }
  }
}

// ── Import → seed mapping ──────────────────────────────────────────────────

/**
 * Pull the world-relevant create actions (NPC / Location / Faction / Lore) out
 * of a parsed action list and shape them into a WorldSeed. Session-, module-,
 * and campaign-scoped actions are ignored — those belong to a campaign the DM
 * fleshes out later, not to a bare world.
 */
export function importActionsToSeed(actions: ImportAction[]): WorldSeed {
  const seed: WorldSeed = { factions: [], locations: [], npcs: [], lore: [] };
  for (const a of actions) {
    switch (a.type) {
      case 'upsertFaction':
        if (a.payload.name) seed.factions.push({ name: a.payload.name, faction_type: a.payload.faction_type, overview: a.payload.overview });
        break;
      case 'upsertLocation':
        if (a.payload.name) seed.locations.push({ name: a.payload.name, location_type: a.payload.location_type, region: a.payload.region, description: a.payload.description });
        break;
      case 'upsertNPC':
        if (a.payload.name) seed.npcs.push({ name: a.payload.name, role: a.payload.role, status: a.payload.status, description: a.payload.description, location: a.payload.location });
        break;
      case 'upsertLore':
        if (a.payload.title) seed.lore.push({ title: a.payload.title, category: a.payload.category, content: a.payload.content });
        break;
      default:
        break;
    }
  }
  return seed;
}

/** One row of a WorldSeed's entity breakdown, for the import-review UI. */
export interface WorldSeedSummaryRow {
  type: 'upsertNPC' | 'upsertLocation' | 'upsertFaction' | 'upsertLore';
  label: string;
  glyph: string;
  count: number;
}

/**
 * Break a WorldSeed down by entity kind, in a stable display order, so the
 * import panel can show the DM exactly what it will create — mirroring
 * summarizeSeedActions on the campaign import path.
 */
export function summarizeWorldSeed(seed: WorldSeed): WorldSeedSummaryRow[] {
  const rows: { type: WorldSeedSummaryRow['type']; count: number }[] = [
    { type: 'upsertNPC', count: seed.npcs.length },
    { type: 'upsertLocation', count: seed.locations.length },
    { type: 'upsertFaction', count: seed.factions.length },
    { type: 'upsertLore', count: seed.lore.length },
  ];
  return rows
    .filter(r => r.count > 0)
    .map(r => ({ ...r, label: entityMeta[r.type].label, glyph: entityMeta[r.type].glyph }));
}
