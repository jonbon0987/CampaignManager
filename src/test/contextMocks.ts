// src/test/contextMocks.ts
// -----------------------------------------------------------
// Default context values for component tests. The app's contexts
// (CampaignContext, WorldContext, …) load data from Supabase on mount, so
// wrapping the real providers in a test would hit the network. Instead, tests
// mock the context *hooks* and feed them one of these plain objects.
//
// Usage (with vi.hoisted so the vi.mock factory can see the holder):
//
//   const h = vi.hoisted(() => ({ campaign: { value: null as any } }));
//   vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
//   beforeEach(() => { h.campaign.value = makeCampaignContext({ ideas: [...] }); });
//
// Every mutation is a vi.fn() resolving to undefined; override any field via `over`.
// -----------------------------------------------------------

import { vi } from 'vitest';

const fn = () => vi.fn().mockResolvedValue(undefined);

/** A CampaignContext value with empty collections and no-op async mutations. */
export function makeCampaignContext(over: Record<string, unknown> = {}) {
  return {
    // collections
    ideas: [], npcs: [], pcs: [], factions: [], locations: [], lore: [],
    sessions: [], hooks: [], modules: [], submodules: [], scenes: [],
    relationships: [], monsterStatblocks: [],
    overview: { title: 'Test Campaign', plotSummary: '' },
    // canon pools + link state (compendium tabs)
    globalLore: [], linkedLoreIds: [], globalLocations: [], linkedLocationIds: [],
    globalNPCs: [], linkedNPCIds: [],
    // common mutations
    upsertIdea: fn(), deleteIdea: fn(), promoteIdea: fn(),
    upsertLore: fn(), deleteLore: fn(), linkLoreToCampaign: fn(), unlinkLoreFromCampaign: fn(),
    upsertLocation: fn(), deleteLocation: fn(), linkLocationToCampaign: fn(), unlinkLocationFromCampaign: fn(),
    upsertPC: fn(), deletePC: fn(),
    upsertNPC: fn(), deleteNPC: fn(), linkNPCToCampaign: fn(), unlinkNPCFromCampaign: fn(),
    upsertFaction: fn(), deleteFaction: fn(),
    upsertHook: fn(), deleteHook: fn(),
    upsertModule: fn(), deleteModule: fn(),
    upsertSubmodule: fn(), deleteSubmodule: fn(), loadSubmodules: fn(),
    upsertScene: fn(), deleteScene: fn(), loadScenes: fn(), loadModuleTree: fn(),
    ...over,
  };
}

/** A WorldContext value with empty collections and no-op async mutations. */
export function makeWorldContext(over: Record<string, unknown> = {}) {
  return {
    activeWorld: { id: 'w1', name: 'Test World', calendar: 'CR', tagline: '', era: '', year: 0 },
    activeWorldId: 'w1',
    worlds: [], campaigns: [], timeline: [], factions: [], lore: [], locations: [], npcs: [],
    createCampaign: fn(), openCampaign: vi.fn(),
    createTimelineEvent: fn(), upsertTimelineEvent: fn(), deleteTimelineEvent: fn(),
    timelineTypeConfig: {}, eraConfig: {},
    // navigation used by compendium tabs to jump back into world/canon views
    backToWorld: vi.fn(), setWorldTab: vi.fn(), setSelected: vi.fn(),
    ...over,
  };
}

/** A useConfirm() result — a confirm function resolving to `result` (default true). */
export function makeConfirm(result = true) {
  return vi.fn().mockResolvedValue(result);
}

/** A useToast() result — a toast function (no-op). */
export function makeToast() {
  return vi.fn();
}
