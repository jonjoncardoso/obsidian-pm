import type { ProjectRef, TaskRef, VaultIndex } from './VaultIndex'

export interface SprintFilterGroup {
  root: ProjectRef
  umbrellas: ProjectRef[]
}

/** Roots with their direct child umbrellas (version folders stay under the umbrella). */
export function collectSprintFilterGroups(index: VaultIndex): SprintFilterGroup[] {
  return index.rootRefs().map((root) => ({
    root,
    umbrellas: index.childRefs(root.path)
  }))
}

export function allSprintUmbrellaPaths(groups: SprintFilterGroup[]): string[] {
  return groups.flatMap((group) => group.umbrellas.map((u) => u.path))
}

/**
 * Filter key for a card's project: the pm-project directly under a root.
 * `Projects/Research/Tutor Paper` → itself.
 * `Projects/Tooling/board/v2.0 - board` → board.
 */
export function sprintUmbrellaPath(projectPath: string, index: VaultIndex): string | null {
  if (!index.projectRef(projectPath)) return null
  const ancestors = index.ancestorRefs(projectPath)
  if (ancestors.length === 0) return null
  if (ancestors.length === 1) return projectPath
  return ancestors[1]?.path ?? null
}

/** Drop members whose umbrella path is in the hidden set. Empty hidden = show all. */
export function filterMembersByProjects(
  members: TaskRef[],
  hiddenUmbrellaPaths: string[],
  index: VaultIndex
): TaskRef[] {
  if (hiddenUmbrellaPaths.length === 0) return members
  const hidden = new Set(hiddenUmbrellaPaths)
  return members.filter((ref) => {
    if (!ref.projectPath) return true
    const umbrella = sprintUmbrellaPath(ref.projectPath, index)
    if (!umbrella) return true
    return !hidden.has(umbrella)
  })
}

export function toggleHiddenPath(hidden: string[], path: string, hide: boolean): string[] {
  const set = new Set(hidden)
  if (hide) set.add(path)
  else set.delete(path)
  return [...set]
}

export function hideAllUmbrellas(groups: SprintFilterGroup[]): string[] {
  return allSprintUmbrellaPaths(groups)
}

export function rootFullyVisible(group: SprintFilterGroup, hidden: string[]): boolean {
  if (group.umbrellas.length === 0) return true
  const set = new Set(hidden)
  return group.umbrellas.every((u) => !set.has(u.path))
}

export function rootFullyHidden(group: SprintFilterGroup, hidden: string[]): boolean {
  if (group.umbrellas.length === 0) return false
  const set = new Set(hidden)
  return group.umbrellas.every((u) => set.has(u.path))
}
