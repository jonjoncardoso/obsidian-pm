import type PMPlugin from '../main'
import type { Project, Task } from '../types'
import { flattenTasks, type FlatTask, totalLoggedHours } from '../store/TaskTreeOps'
import { isTerminalStatus, getStatusConfig, dueUrgency, safeAsync } from '../utils'
import { openTaskModal } from '../ui/ModalFactory'
import { TaskRow } from '../ui/composites/TaskRow'
import { TitleCell } from '../ui/composites/cells/TitleCell'
import { StatusCell } from '../ui/composites/cells/StatusCell'
import { PriorityCell } from '../ui/composites/cells/PriorityCell'
import { AssigneesCell } from '../ui/composites/cells/AssigneesCell'
import { DueDateCell } from '../ui/composites/cells/DueDateCell'
import { ProgressCell } from '../ui/composites/cells/ProgressCell'
import { TimeCell } from '../ui/composites/cells/TimeCell'
import { linkedRefs } from './linkedRefs'
import { childTreeGuides } from '../ui/composites/treeGuides'
import { renderGlyph } from '../ui/composites/properties'

const COL_COUNT = 7

interface OverviewTreeRow extends FlatTask {
  guides: boolean[]
  isLastChild: boolean
}

/**
 * Render a read-only task table on the Project overview page.
 *
 * For leaf projects (no sub-projects): renders the project's own tasks.
 * For parent projects: loads each child project and renders grouped sections
 * with a sub-project header row separating each group.
 */
export async function renderOverviewTasks(
  parent: HTMLElement,
  plugin: PMPlugin,
  project: Project
): Promise<void> {
  const children = plugin.index.childRefs(project.filePath)

  const wrapper = parent.createDiv('pm-overview-tasks-wrapper')
  const table = wrapper.createEl('table', { cls: 'pm-overview-tasks' })

  const thead = table.createEl('thead')
  const hrow = thead.createEl('tr')
  for (const label of ['Task', 'Status', 'Priority', 'Assignees', 'Due', 'Progress', 'Time']) {
    hrow.createEl('th', { text: label })
  }

  const tbody = table.createEl('tbody')

  if (children.length > 0) {
    // Parent project: render each child's tasks under a group header.
    // Include the parent's own direct tasks first if any exist.
    if (project.tasks.length > 0) {
      renderGroupHeader(tbody, project.title, project.icon, project.color)
      renderProjectRows(tbody, plugin, project)
    }
    for (const childRef of children) {
      const child = await plugin.store.loadProjectByPath(childRef.path)
      if (!child) continue
      const flat = flattenTasks(child.tasks).filter((f) => !f.task.archived)
      if (flat.length === 0) continue
      renderGroupHeader(tbody, childRef.title, childRef.icon, childRef.color)
      renderProjectRows(tbody, plugin, child)
    }
  } else {
    // Leaf project: render own tasks directly.
    renderProjectRows(tbody, plugin, project)
  }
}

function renderGroupHeader(
  tbody: HTMLElement,
  title: string,
  icon: string,
  color: string
): void {
  const tr = tbody.createEl('tr', { cls: 'pm-overview-tasks-group' })
  const td = tr.createEl('td', { attr: { colspan: String(COL_COUNT) } })
  const inner = td.createDiv('pm-overview-tasks-group-inner')
  renderGlyph(inner.createSpan({ cls: 'pm-overview-tasks-group-icon' }), { icon, color })
  inner.createSpan({ cls: 'pm-overview-tasks-group-title', text: title })
}

function renderProjectRows(
  tbody: HTMLElement,
  plugin: PMPlugin,
  project: Project
): void {
  const config = plugin.store.configFor(project)
  const flat = flattenTasks(project.tasks).filter((f) => !f.task.archived)
  const visible = flat.filter((f) => f.visible)

  const rows = buildTreeRows(visible)
  const { statuses, priorities, priorityIcons } = config

  const openEditor = (task: Task): void => {
    openTaskModal(plugin, project, {
      task,
      onSave: async () => {}
    })
  }

  for (const row of rows) {
    const { task } = row
    const isDone = isTerminalStatus(task.status, statuses)
    const statusConfig = getStatusConfig(statuses, task.status)

    new TaskRow(tbody, {
      taskId: task.id,
      depth: row.depth,
      isDone,
      isArchived: false,
      isSelected: false,
      onRowClick: () => openEditor(task)
    })

    const tr = tbody.lastElementChild as HTMLElement

    new TitleCell(tr, {
      task,
      treeGuides: row.guides,
      isLastChild: row.isLastChild,
      showTagColors: plugin.settings.showTagColors,
      onTitleClick: () => openEditor(task),
      onTitleSave: async () => {},
      onAddSubtask: () => {}
    })

    new StatusCell(tr, {
      task,
      statuses,
      onChange: safeAsync(async (status) => {
        await plugin.store.updateTask(project, task.id, { status })
      })
    })

    new PriorityCell(tr, {
      task,
      priorities,
      priorityIcons,
      onChange: safeAsync(async (priority) => {
        await plugin.store.updateTask(project, task.id, { priority })
      })
    })

    new AssigneesCell(tr, linkedRefs(plugin.app, task.assignees, task.filePath ?? project.filePath))

    new DueDateCell(tr, {
      task,
      urgency: dueUrgency(task, statuses),
      onSave: async () => {}
    })

    new ProgressCell(tr, {
      value: task.progress,
      color: statusConfig?.color ?? 'var(--interactive-accent)',
      onSave: async () => {}
    })

    new TimeCell(tr, { logged: totalLoggedHours(task), estimate: task.timeEstimate ?? 0 })
  }
}

function buildTreeRows(visible: FlatTask[]): OverviewTreeRow[] {
  const childrenByParent = new Map<string | null, { flat: FlatTask; index: number }[]>()
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i]
    const key = f.parentId
    let list = childrenByParent.get(key)
    if (!list) {
      list = []
      childrenByParent.set(key, list)
    }
    list.push({ flat: f, index: i })
  }

  const rows: OverviewTreeRow[] = []
  const walk = (parentId: string | null, trail: boolean[]): void => {
    const items = childrenByParent.get(parentId)
    if (!items) return
    items.forEach((item, i) => {
      const isLastChild = i === items.length - 1
      const guides = padGuides(trail, item.flat.depth)
      rows.push({ ...item.flat, guides, isLastChild })
      walk(item.flat.task.id, childTreeGuides(guides, isLastChild))
    })
  }
  walk(null, [])
  return rows
}

function padGuides(trail: boolean[], depth: number): boolean[] {
  if (trail.length >= depth) return trail.slice(0, depth)
  return [...Array.from<boolean>({ length: depth - trail.length }).fill(false), ...trail]
}
