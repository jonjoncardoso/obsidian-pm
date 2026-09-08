import { Menu } from 'obsidian'
import type { Project, Task } from '../types'
import type PMPlugin from '../main'
import { confirmDialog } from './ModalFactory'
import { sprintMembership, toggleSprintTag, type SprintLane } from '../store/sprintTags'
import { sprintConfirmCopy, sprintTreeSize, writeSprintLane } from '../store/sprintApply'

export function addSprintMenuItems(menu: Menu, tags: string[], onLane: (lane: SprintLane) => void): void {
  const membership = sprintMembership(tags)
  addLaneItem(menu, 'current', membership === 'current' ? 'In sprint' : 'Add to sprint', onLane)
  addLaneItem(menu, 'next', membership === 'next' ? 'In next sprint' : 'Add to next sprint', onLane)
}

function addLaneItem(menu: Menu, lane: SprintLane, title: string, onLane: (lane: SprintLane) => void): void {
  menu.addItem((item) =>
    item
      .setTitle(title)
      .setIcon(lane === 'current' ? 'calendar-check' : 'calendar-plus')
      .onClick(() => onLane(lane))
  )
}

export async function applySprintLaneForTask(
  plugin: PMPlugin,
  project: Project,
  task: Task,
  lane: SprintLane
): Promise<boolean> {
  const adding = sprintMembership(task.tags) !== lane
  const nextLane: SprintLane | null = adding ? lane : null
  if (task.subtasks.length === 0) {
    await plugin.store.updateTask(project, task.id, { tags: toggleSprintTag(task.tags, lane) })
    return true
  }
  const copy = sprintConfirmCopy(adding, lane, sprintTreeSize(task))
  if (!(await confirmDialog(plugin.app, copy.message, copy.confirmLabel))) return false
  await writeSprintLane(plugin.store, project, task, nextLane)
  return true
}
