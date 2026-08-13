import { describe, it, expect } from 'vitest';
import {
  isModuleUnlocked,
  wouldCreateModuleCycle,
  wouldCreateSubmoduleCycle,
  isSubmoduleUnlocked,
} from './moduleUtils';
import type {
  Module,
  ModuleDependency,
  SubmoduleDependency,
  Submodule,
  DependencyType,
} from './database.types';

// --- fixture factories (only the fields these functions read are meaningful) ---

function mod(id: string, status: Module['status'] = 'active'): Module {
  return { id, status } as unknown as Module;
}

function dep(o: {
  dependent: string;
  prereq: string;
  type?: DependencyType;
  group?: string | null;
  threshold?: number | null;
  id?: string;
}): ModuleDependency {
  return {
    id: o.id ?? `${o.dependent}->${o.prereq}`,
    dependent_id: o.dependent,
    prerequisite_id: o.prereq,
    dependency_type: o.type ?? 'required',
    group_id: o.group ?? null,
    threshold: o.threshold ?? null,
  } as unknown as ModuleDependency;
}

function subDep(dependent: string, prereq: string): SubmoduleDependency {
  return {
    id: `${dependent}->${prereq}`,
    dependent_id: dependent,
    prerequisite_id: prereq,
  } as unknown as SubmoduleDependency;
}

describe('isModuleUnlocked', () => {
  it('unlocks a module with no dependencies', () => {
    expect(isModuleUnlocked('m1', [], [mod('m1')])).toBe(true);
  });

  it('unlocks when the single required prerequisite is completed', () => {
    const deps = [dep({ dependent: 'm2', prereq: 'm1' })];
    const modules = [mod('m1', 'completed'), mod('m2')];
    expect(isModuleUnlocked('m2', deps, modules)).toBe(true);
  });

  it('stays locked when a required prerequisite is not completed', () => {
    const deps = [dep({ dependent: 'm2', prereq: 'm1' })];
    expect(isModuleUnlocked('m2', deps, [mod('m1', 'active'), mod('m2')])).toBe(false);
  });

  it('requires ALL required prerequisites to be completed (AND)', () => {
    const deps = [
      dep({ dependent: 'm3', prereq: 'm1' }),
      dep({ dependent: 'm3', prereq: 'm2' }),
    ];
    const modules = [mod('m1', 'completed'), mod('m2', 'active'), mod('m3')];
    expect(isModuleUnlocked('m3', deps, modules)).toBe(false);
    modules[1] = mod('m2', 'completed');
    expect(isModuleUnlocked('m3', deps, modules)).toBe(true);
  });

  it('treats a missing prerequisite module as not completed', () => {
    const deps = [dep({ dependent: 'm2', prereq: 'ghost' })];
    expect(isModuleUnlocked('m2', deps, [mod('m2')])).toBe(false);
  });

  it('satisfies an OR group when at least one member is completed (default threshold 1)', () => {
    const deps = [
      dep({ dependent: 'm3', prereq: 'm1', type: 'optional', group: 'g1' }),
      dep({ dependent: 'm3', prereq: 'm2', type: 'optional', group: 'g1' }),
    ];
    const none = [mod('m1', 'active'), mod('m2', 'active'), mod('m3')];
    expect(isModuleUnlocked('m3', deps, none)).toBe(false);
    const one = [mod('m1', 'completed'), mod('m2', 'active'), mod('m3')];
    expect(isModuleUnlocked('m3', deps, one)).toBe(true);
  });

  it('honors an OR group threshold greater than 1 (N of M)', () => {
    const deps = [
      dep({ dependent: 'm4', prereq: 'm1', type: 'optional', group: 'g1', threshold: 2 }),
      dep({ dependent: 'm4', prereq: 'm2', type: 'optional', group: 'g1', threshold: 2 }),
      dep({ dependent: 'm4', prereq: 'm3', type: 'optional', group: 'g1', threshold: 2 }),
    ];
    const onlyOne = [mod('m1', 'completed'), mod('m2', 'active'), mod('m3', 'active'), mod('m4')];
    expect(isModuleUnlocked('m4', deps, onlyOne)).toBe(false);
    const two = [mod('m1', 'completed'), mod('m2', 'completed'), mod('m3', 'active'), mod('m4')];
    expect(isModuleUnlocked('m4', deps, two)).toBe(true);
  });

  it('treats optional deps with null group_id as independent single-member groups (each must be met)', () => {
    const deps = [
      dep({ dependent: 'm3', prereq: 'm1', type: 'optional', group: null, id: 'd1' }),
      dep({ dependent: 'm3', prereq: 'm2', type: 'optional', group: null, id: 'd2' }),
    ];
    const oneDone = [mod('m1', 'completed'), mod('m2', 'active'), mod('m3')];
    expect(isModuleUnlocked('m3', deps, oneDone)).toBe(false);
    const bothDone = [mod('m1', 'completed'), mod('m2', 'completed'), mod('m3')];
    expect(isModuleUnlocked('m3', deps, bothDone)).toBe(true);
  });

  it('combines required (AND) and optional (OR) constraints', () => {
    const deps = [
      dep({ dependent: 'm4', prereq: 'm1' }), // required
      dep({ dependent: 'm4', prereq: 'm2', type: 'optional', group: 'g1' }),
      dep({ dependent: 'm4', prereq: 'm3', type: 'optional', group: 'g1' }),
    ];
    // required met, OR group met
    const ok = [mod('m1', 'completed'), mod('m2', 'completed'), mod('m3', 'active'), mod('m4')];
    expect(isModuleUnlocked('m4', deps, ok)).toBe(true);
    // OR group met but required missing
    const reqMissing = [mod('m1', 'active'), mod('m2', 'completed'), mod('m3', 'active'), mod('m4')];
    expect(isModuleUnlocked('m4', deps, reqMissing)).toBe(false);
  });

  it('ignores dependencies belonging to other modules', () => {
    const deps = [dep({ dependent: 'other', prereq: 'm1' })];
    expect(isModuleUnlocked('m2', deps, [mod('m1', 'active'), mod('m2')])).toBe(true);
  });
});

describe('wouldCreateModuleCycle', () => {
  it('allows an edge into an empty graph', () => {
    expect(wouldCreateModuleCycle([], 'a', 'b')).toBe(false);
  });

  it('detects a direct 2-node cycle (A→B already, adding B→A)', () => {
    const deps = [dep({ dependent: 'a', prereq: 'b' })];
    expect(wouldCreateModuleCycle(deps, 'b', 'a')).toBe(true);
  });

  it('detects a longer transitive cycle (A→B→C, adding C→A)', () => {
    const deps = [dep({ dependent: 'a', prereq: 'b' }), dep({ dependent: 'b', prereq: 'c' })];
    expect(wouldCreateModuleCycle(deps, 'c', 'a')).toBe(true);
  });

  it('allows an edge that does not close a loop', () => {
    const deps = [dep({ dependent: 'a', prereq: 'b' }), dep({ dependent: 'b', prereq: 'c' })];
    expect(wouldCreateModuleCycle(deps, 'd', 'a')).toBe(false);
  });

  it('flags a self-referential edge as a cycle', () => {
    expect(wouldCreateModuleCycle([], 'a', 'a')).toBe(true);
  });
});

describe('wouldCreateSubmoduleCycle', () => {
  it('allows an acyclic edge and detects a cycle', () => {
    const deps = [subDep('a', 'b')];
    expect(wouldCreateSubmoduleCycle(deps, 'c', 'a')).toBe(false);
    expect(wouldCreateSubmoduleCycle(deps, 'b', 'a')).toBe(true);
  });
});

describe('isSubmoduleUnlocked', () => {
  it('unlocks a submodule with no dependencies', () => {
    expect(isSubmoduleUnlocked('s1', [], [])).toBe(true);
  });

  it('returns true even with unmet deps (documented placeholder until submodules get a status field)', () => {
    const deps = [subDep('s2', 's1')];
    expect(isSubmoduleUnlocked('s2', deps, [] as Submodule[])).toBe(true);
  });
});
