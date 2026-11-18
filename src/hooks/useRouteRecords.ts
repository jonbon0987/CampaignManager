// What the address needs to know about the records on screen: each one's name
// (shown beside its short id) and its full id (looked up from a short one).
// See lib/route for how ids are written.

import { useCallback, useMemo } from 'react';
import type { Tab } from '../App';
import type { WorldTab } from '../types/world';
import { useCampaign } from '../context/CampaignContext';
import { useItems } from '../context/items';
import { useWorld } from '../context/WorldContext';
import { matchesRef } from '../lib/route';
import { sessionName } from '../lib/sessionLifecycle';

export interface RouteRecord { id: string; name: string }
type Named = { id: string; name: string };

const find = (list: Named[] | undefined, ref: string | null | undefined): RouteRecord | undefined => {
  if (!ref || !list) return undefined;
  return list.find(r => r.id === ref) ?? list.find(r => matchesRef(r.id, ref));
};

/**
 * The campaign's records by tab. `record(tab, ref)` finds a record from its
 * id or short id; `part(ref)` finds a module's part or scene.
 */
export function useCampaignRouteRecords() {
  const c = useCampaign();
  const items = useItems()?.items;

  const byTab = useMemo<Partial<Record<Tab, Named[]>>>(() => ({
    cast: [
      ...c.npcs.map(n => ({ id: n.id, name: n.name })),
      ...c.factions.map(f => ({ id: f.id, name: f.name })),
      ...c.pcs.map(p => ({ id: p.id, name: p.character_name })),
    ],
    lore: c.lore.map(e => ({ id: e.id, name: e.title })),
    locations: c.locations.map(l => ({ id: l.id, name: l.name })),
    items: (items ?? []).map(i => ({ id: i.id, name: i.name })),
    threads: c.hooks.map(h => ({ id: h.id, name: h.title })),
    modules: c.modules.map(m => ({ id: m.id, name: m.title })),
    sessions: c.sessions.map(s => ({ id: s.id, name: sessionName(s) })),
    combat: [
      ...c.encounters.map(e => ({ id: e.id, name: e.name })),
      ...c.randomEncounterTables.map(t => ({ id: t.id, name: t.name })),
      ...c.monsterStatblocks.map(m => ({ id: m.id, name: m.name })),
    ],
  }), [c.npcs, c.factions, c.pcs, c.lore, c.locations, items, c.hooks, c.modules, c.sessions, c.encounters, c.randomEncounterTables, c.monsterStatblocks]);

  const parts = useMemo<Named[]>(() => [
    ...c.submodules.map(s => ({ id: s.id, name: s.title })),
    ...c.scenes.map(s => ({ id: s.id, name: s.title })),
  ], [c.submodules, c.scenes]);

  const record = useCallback((tab: Tab, ref: string | null | undefined) => find(byTab[tab], ref), [byTab]);
  const part = useCallback((ref: string | null | undefined) => find(parts, ref), [parts]);
  return { record, part };
}

/** The world's records by tab, found from an id or short id. */
export function useWorldRouteRecords() {
  const w = useWorld();
  const byTab = useMemo<Partial<Record<WorldTab, Named[]>>>(() => ({
    npcs: [...w.npcs, ...w.factions].map(x => ({ id: x.id, name: x.name })),
    lore: w.lore.map(e => ({ id: e.id, name: e.title })),
    locations: w.locations.map(l => ({ id: l.id, name: l.name })),
    combat: [
      ...w.worldEncounters.map(e => ({ id: e.id, name: e.name })),
      ...w.worldRandomEncounterTables.map(t => ({ id: t.id, name: t.name })),
      ...w.worldStatblocks.map(m => ({ id: m.id, name: m.name })),
    ],
  }), [w.npcs, w.factions, w.lore, w.locations, w.worldEncounters, w.worldRandomEncounterTables, w.worldStatblocks]);
  return useCallback((tab: WorldTab, ref: string | null | undefined) => find(byTab[tab], ref), [byTab]);
}
