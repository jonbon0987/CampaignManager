// src/test/fixtures.ts
// -----------------------------------------------------------
// Factory helpers for DB entity types, for use in unit tests.
//
// Tests generally read only a handful of fields off these records, so the
// factories build a minimal object and cast it to the full row type via
// `as unknown as X`. Pass `over` to set the fields your test cares about:
//
//   makeModule('m1', 'completed')
//   makeNPC({ name: 'Kutter', status: 'active' })
//   makeModuleDep('m2', 'm1', { dependency_type: 'optional', group_id: 'g1' })
// -----------------------------------------------------------

import type {
  Module, ModuleDependency, SubmoduleDependency, Submodule, Scene,
  Session, PlayerCharacter, NPC, Location, Faction, Hook, LoreEntry,
  MonsterStatblock,
} from '../lib/database.types';

export function makeModule(id: string, status: Module['status'] = 'active', over: Partial<Module> = {}): Module {
  return { id, title: id, status, chapter: null, ...over } as unknown as Module;
}

export function makeModuleDep(
  dependentId: string,
  prerequisiteId: string,
  over: Partial<ModuleDependency> = {},
): ModuleDependency {
  return {
    id: `${dependentId}->${prerequisiteId}`,
    dependent_id: dependentId,
    prerequisite_id: prerequisiteId,
    dependency_type: 'required',
    group_id: null,
    threshold: null,
    ...over,
  } as unknown as ModuleDependency;
}

export function makeSubmoduleDep(
  dependentId: string,
  prerequisiteId: string,
  over: Partial<SubmoduleDependency> = {},
): SubmoduleDependency {
  return {
    id: `${dependentId}->${prerequisiteId}`,
    dependent_id: dependentId,
    prerequisite_id: prerequisiteId,
    ...over,
  } as unknown as SubmoduleDependency;
}

export function makeSubmodule(id: string, over: Partial<Submodule> = {}): Submodule {
  return { id, title: id, sort_order: 0, ...over } as unknown as Submodule;
}

export function makeScene(id: string, over: Partial<Scene> = {}): Scene {
  return { id, title: id, sort_order: 0, ...over } as unknown as Scene;
}

export function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 's1', session_number: 1, session_date: null, summary: null, ...over,
  } as unknown as Session;
}

export function makePC(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    id: 'pc1', character_name: 'Hero', player_name: null, race: null, class: null, ...over,
  } as unknown as PlayerCharacter;
}

export function makeNPC(over: Partial<NPC> = {}): NPC {
  return {
    id: 'npc1', name: 'NPC', role: null, affiliation: null, status: 'active', met_by_pcs: false, ...over,
  } as unknown as NPC;
}

export function makeLocation(over: Partial<Location> = {}): Location {
  return {
    id: 'loc1', name: 'Place', region: null, location_type: null, ...over,
  } as unknown as Location;
}

export function makeFaction(over: Partial<Faction> = {}): Faction {
  return { id: 'fac1', name: 'Faction', faction_type: null, ...over } as unknown as Faction;
}

export function makeHook(over: Partial<Hook> = {}): Hook {
  return {
    id: 'hook1', title: 'Hook', category: null, is_active: true, ...over,
  } as unknown as Hook;
}

export function makeLoreEntry(over: Partial<LoreEntry> = {}): LoreEntry {
  return { id: 'lore1', title: 'Lore', category: null, content: null, ...over } as unknown as LoreEntry;
}

export function makeStatblock(over: Partial<MonsterStatblock> = {}): MonsterStatblock {
  return {
    id: 'mob1', name: 'Monster', creature_type: null, challenge_rating: null, ...over,
  } as unknown as MonsterStatblock;
}
