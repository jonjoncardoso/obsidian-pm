import type { Project, Task } from '../types'
import type { ProjectStore } from './ProjectStore'
import { findTask, flattenTasks } from './TaskTreeOps'
import { applySprintTag, retagCurrentToPast, type SprintLane } from './sprintTags'

export function sprintTreeSize(task: Task): number {
  return flattenTasks([task]).length
}

export function sprintLaneLabel(lane: SprintLane): string {
  return lane === 'current' ? 'This week' : 'Next'
}

export function sprintConfirmCopy(
  adding: boolean,
  lane: SprintLane,
  count: number
): { message: string; confirmLabel: string } {
  const dest = sprintLaneLabel(lane)
  if (adding) {
    return {
      message: `This will add ALL children to ${dest}.`,
      confirmLabel: `Add ${count} tasks`
    }
  }
  return {
    message: `This will remove ALL children from ${dest}.`,
    confirmLabel: `Remove ${count} tasks`
  }
}

export function closeWeekConfirmCopy(
  currentCount: number,
  nextCount: number,
  pastTag: string
): { message: string; confirmLabel: string } {
  return {
    message: `${currentCount} cards tagged week-sprint become ${pastTag}. ${nextCount} cards tagged next-sprint become week-sprint.`,
    confirmLabel: 'Close week'
  }
}

export async function writeSprintLane(
  store: ProjectStore,
  project: Project,
  root: Task,
  lane: SprintLane | null
): Promise<void> {
  const ids = flattenTasks([root]).map((row) => row.task.id)
  for (const id of ids) {
    const live = findTask(project.tasks, id)
    if (!live) continue
    await store.updateTask(project, id, { tags: applySprintTag(live.tags, lane) })
  }
}

export async function writeCloseWeek(
  store: ProjectStore,
  loadProject: (path: string) => Promise<Project | null>,
  current: { id: string; projectPath: string }[],
  next: { id: string; projectPath: string }[],
  pastTag: string
): Promise<void> {
  const cache = new Map<string, Project>()
  const projectOf = async (path: string): Promise<Project | null> => {
    const cached = cache.get(path)
    if (cached) return cached
    const loaded = await loadProject(path)
    if (loaded) cache.set(path, loaded)
    return loaded
  }
  for (const row of current) {
    const project = await projectOf(row.projectPath)
    if (!project) continue
    const live = findTask(project.tasks, row.id)
    if (!live) continue
    await store.updateTask(project, row.id, { tags: retagCurrentToPast(live.tags, pastTag) })
  }
  for (const row of next) {
    const project = await projectOf(row.projectPath)
    if (!project) continue
    const live = findTask(project.tasks, row.id)
    if (!live) continue
    await store.updateTask(project, row.id, { tags: applySprintTag(live.tags, 'current') })
  }
}
