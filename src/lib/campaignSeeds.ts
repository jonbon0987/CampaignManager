// campaignSeeds.ts
// ---------------------------------------------------------------------------
// Content for the Campaign-creation gate's non-scratch paths — the campaign
// analog of worldSeeds.ts.
//
//  • CAMPAIGN_TEMPLATES — prebuilt campaign starts offered on the "Use a
//    template" panel. Each carries the campaign's own fields (premise → the
//    plot_summary, a party line) plus a few starter plot threads (hooks).
//  • seedCampaignHooks — inserts a template/AI/import's starter hooks against a
//    new campaign_id via the same db helper the app uses everywhere else.
//  • importActionsToHooks — pulls the hook subset out of a parsed document so
//    the Import path can stage real threads.
// ---------------------------------------------------------------------------

import { Hooks as HooksDB } from './db';
import type { ImportAction } from './documentImport';

/** A starter plot thread. category: main_plot | side_quest | character_arc | faction. */
export interface SeedHook {
  title: string;
  category?: string | null;
  description?: string | null;
  state?: string | null;
}

/** Fields a template/AI draft can prefill on the campaign row itself. */
export interface CampaignFields {
  party?: string;
  plot_summary?: string;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  /** One-line pitch shown on the template card. */
  pitch: string;
  premise: string; // → campaign.plot_summary
  party: string;   // → campaign.party
  hooks: SeedHook[];
}

// ── Prebuilt campaign templates ────────────────────────────────────────────

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'storm',
    name: 'The Gathering Storm',
    pitch: 'A fragile peace cracks as three powers circle the same prize.',
    premise:
      'The old treaty is failing. The party begins as minor agents of a border hold caught between three rival powers, each convinced the others struck first. What starts as a missing envoy becomes the thread that unravels the peace — and the party decides whether it holds or breaks.',
    party: 'A mid-level party of 3–5, loosely in the service of a border hold.',
    hooks: [
      { title: 'The Missing Envoy', category: 'main_plot', description: 'A peace envoy vanished on the road between the two capitals. Both sides blame the other; neither will search.' },
      { title: 'A Traitor on the Council', category: 'faction', description: 'Someone on the town council is feeding troop movements to the enemy. Their handwriting is on an intercepted order.' },
      { title: 'The Beacon Rule', category: 'side_quest', description: 'If the border beacons are ever all lit at once it means open war. Someone has been testing them, one at a time.' },
    ],
  },
  {
    id: 'deep',
    name: 'Bones of the Deep',
    pitch: 'An ancient vault opens beneath the city, and everyone wants in.',
    premise:
      'A quake cracked the old foundations, and something sealed away for a very long reason is stirring below. Treasure crews, cults, and the city watch all race for the vault. The party goes down first — and has to decide what should be allowed to come back up.',
    party: 'A scrappy party of 3–5 delvers, level 1–3, in it for coin or curiosity.',
    hooks: [
      { title: 'The Sealed Door', category: 'main_plot', description: 'A vault door with seven locks and a warning in a dead tongue. Six of the locks are already broken.' },
      { title: 'The Rival Crew', category: 'faction', description: 'A better-funded delving crew is a day ahead — and leaving traps behind them for whoever follows.' },
      { title: 'Something Got Out', category: 'side_quest', description: 'People near the crack have started sleepwalking toward it at night. It began the day the door was first opened.' },
    ],
  },
  {
    id: 'town',
    name: 'A Quiet Little Town',
    pitch: 'A sleepy hamlet where everyone is kind and something is very wrong.',
    premise:
      'The party arrives in a welcoming little town at harvest time. The food is good, the people are warm, and travelers who stay too long stop leaving. A slow-burn, low-stakes mystery that rewards paying attention — and asking who benefits.',
    party: 'A fresh party of 3–5, level 1–2, just passing through.',
    hooks: [
      { title: 'The Ones Who Stayed', category: 'main_plot', description: 'Three travelers "settled down" here this year. Their families never heard from them again.' },
      { title: 'The Too-Kind Mayor', category: 'character_arc', description: 'The mayor knows everyone\'s name before they give it — and would really rather you stayed for the festival.' },
      { title: 'The Old Shrine', category: 'side_quest', description: 'There is a shrine at the edge of the fields the townsfolk tend daily but never speak about.' },
    ],
  },
];

/** Card meta — derived so the UI can never drift from the template. */
export function templateCounts(t: CampaignTemplate) {
  return { hooks: t.hooks.length };
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * Insert a set of starter hooks against a campaign. Best-effort per row: a
 * single failed insert is logged and skipped rather than aborting — the
 * campaign itself already exists by the time this runs.
 */
export async function seedCampaignHooks(campaignId: string, hooks: SeedHook[]): Promise<void> {
  for (const h of hooks) {
    try {
      await HooksDB.upsert({
        campaign_id: campaignId,
        title: h.title,
        category: h.category ?? null,
        description: h.description ?? null,
        state: h.state ?? 'seed',
        last_updated_session: null,
        is_active: true,
        dm_only_notes: null,
      });
    } catch (e) {
      console.error('seedCampaignHooks: hook insert failed', h.title, e);
    }
  }
}

// ── Import → hooks mapping ──────────────────────────────────────────────────

/**
 * Pull the plot-hook create actions out of a parsed document into starter
 * threads. Other campaign entity types (sessions, PCs, NPCs, …) are left for
 * the full campaign importer; a brand-new campaign just wants its threads.
 */
export function importActionsToHooks(actions: ImportAction[]): SeedHook[] {
  const hooks: SeedHook[] = [];
  for (const a of actions) {
    if (a.type === 'upsertHook' && a.payload.title) {
      hooks.push({
        title: a.payload.title,
        category: a.payload.category,
        description: a.payload.description,
        state: a.payload.state,
      });
    }
  }
  return hooks;
}
