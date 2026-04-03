// src/lib/moduleUtils.ts
// Utility functions for module dependency logic.
// Reusable by ModuleDetail UI and future Module Web visualization.

import type { Module, ModuleDependency, SubmoduleDependency, Submodule } from './database.types';

/**
 * Returns true if the given module has all its prerequisites satisfied.
 * - All 'required' (AND) deps must have a prerequisite with status 'completed'.
 * - Each OR group (same group_id, dependency_type='optional') needs at least one completed.
 * - A module with no dependencies is always unlocked.
 */
export function isModuleUnlocked(
  moduleId: string,
  deps: ModuleDependency[],
  modules: Module[],
): boolean {
  const prereqs = deps.filter(d => d.dependent_id === moduleId);
  if (prereqs.length === 0) return true;

  const required = prereqs.filter(d => d.dependency_type === 'required');
  const requiredSatisfied = required.every(d =>
    modules.find(m => m.id === d.prerequisite_id)?.status === 'completed',
  );

  const optional = prereqs.filter(d => d.dependency_type === 'optional');
  const groups = new Map<string, ModuleDependency[]>();
  for (const dep of optional) {
    const gid = dep.group_id ?? dep.id;
    const arr = groups.get(gid) ?? [];
    arr.push(dep);
    groups.set(gid, arr);
  }
  const optionalSatisfied = [...groups.values()].every(group =>
    group.some(d => modules.find(m => m.id === d.prerequisite_id)?.status === 'completed'),
  );

  return requiredSatisfied && optionalSatisfied;
}

/**
 * Returns true if adding an edge (dependentId → prerequisiteId) would create a cycle.
 * Uses BFS from prerequisiteId; if dependentId is reachable, it's a cycle.
 */
export function wouldCreateModuleCycle(
  deps: ModuleDependency[],
  dependentId: string,
  prerequisiteId: string,
): boolean {
  const prereqMap = new Map<string, string[]>();
  for (const d of deps) {
    const arr = prereqMap.get(d.dependent_id) ?? [];
    arr.push(d.prerequisite_id);
    prereqMap.set(d.dependent_id, arr);
  }
  const visited = new Set<string>();
  const queue = [prerequisiteId];
  while (queue.length > 0) {
    const curr = queue.pop()!;
    if (curr === dependentId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const next of prereqMap.get(curr) ?? []) {
      queue.push(next);
    }
  }
  return false;
}

/**
 * Returns true if adding a submodule dependency would create a cycle.
 */
export function wouldCreateSubmoduleCycle(
  deps: SubmoduleDependency[],
  dependentId: string,
  prerequisiteId: string,
): boolean {
  const prereqMap = new Map<string, string[]>();
  for (const d of deps) {
    const arr = prereqMap.get(d.dependent_id) ?? [];
    arr.push(d.prerequisite_id);
    prereqMap.set(d.dependent_id, arr);
  }
  const visited = new Set<string>();
  const queue = [prerequisiteId];
  while (queue.length > 0) {
    const curr = queue.pop()!;
    if (curr === dependentId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const next of prereqMap.get(curr) ?? []) {
      queue.push(next);
    }
  }
  return false;
}

/**
 * Returns true if the given submodule has all its prerequisites satisfied.
 * Submodule status is derived from whether the submodule's parent module is completed
 * (submodules don't have their own status field, so we treat them as "done" when
 * the DM explicitly marks them done — this field can be added later; for now this
 * function is a placeholder returning true so the UI can still show the dependency graph).
 *
 * NOTE: This will be more meaningful once submodules get a status field.
 */
export function isSubmoduleUnlocked(
  submoduleId: string,
  deps: SubmoduleDependency[],
  _submodules: Submodule[],
): boolean {
  const prereqs = deps.filter(d => d.dependent_id === submoduleId);
  if (prereqs.length === 0) return true;
  // Submodules don't have a status field yet — return true as placeholder
  return true;
}
