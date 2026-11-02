import { ButtonComponent, ItemView, TFile, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import { formatDateShort, today } from '../dates'
import { dateUrgency, isTerminalStatus, safeAsync } from '../utils'
import type { PriorityConfig, SprintMatrixLayout, SprintViewMode, StatusConfig, TaskStatus } from '../types'
import type { TaskRef } from '../store/VaultIndex'
import { confirmDialog, openTaskModal } from '../ui/ModalFactory'
import { CollapseToggle } from '../ui/primitives/CollapseToggle'
import { Chip } from '../ui/primitives/Chip'
import { renderGlyph } from '../ui/composites/properties'
import { renderDueChip } from '../ui/composites/dueChip'
import { renderTimeChip } from '../ui/composites/timeChip'
import { renderStatusBadgeFromId } from '../ui/StatusBadge'
import { findTask } from '../store/TaskTreeOps'
import {
  EISENHOWER_QUADRANT_LABELS,
  type EisenhowerQuadrant
} from '../store/eisenhower'
import {
  buildEisenhowerMatrix,
  buildSprintColumn,
  buildSprintColumnFromTag,
  detailsFromFrontmatter,
  listPastSprintTags,
  sprintMembers,
  type EisenhowerMatrixModel,
  type SprintColumnModel,
  type SprintProjectNode,
  type SprintTaskDetails,
  type SprintTaskNode
} from '../store/sprintBoard'
import { closeWeekConfirmCopy, writeCloseWeek } from '../store/sprintApply'
import {
  isPastSprintTag,
  pastSprintTag,
  sprintMembership,
  TAG_SPRINT_CURRENT,
  TAG_SPRINT_NEXT
} from '../store/sprintTags'

/** Keep parent-task titles short on Flat path chips. */
function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return text.trim()
  return `${words.slice(0, maxWords).join(' ')}…`
}

/** Open work by attention; unknown statuses fall after the named ones. */
function attentionRank(status: string): number {
  switch (status) {
    case 'in-progress':
      return 0
    case 'blocked':
      return 1
    case 'review':
      return 2
    case 'todo':
      return 3
    default:
      return 4
  }
}

function priorityRank(priority: string, priorities: PriorityConfig[]): number {
  const idx = priorities.findIndex((cfg) => cfg.id === priority)
  return idx >= 0 ? idx : 999
}

/**
 * Flat quadrant order: open above Done/Cancelled; among open, attention → due →
 * priority → This week before Next; among terminal, newest completed first.
 */
function compareFlatSprintTasks(
  a: SprintTaskNode,
  b: SprintTaskNode,
  statuses: StatusConfig[],
  priorities: PriorityConfig[]
): number {
  const aTerm = isTerminalStatus(a.ref.status, statuses)
  const bTerm = isTerminalStatus(b.ref.status, statuses)
  if (aTerm !== bTerm) return aTerm ? 1 : -1

  if (!aTerm) {
    const byAttention = attentionRank(a.ref.status) - attentionRank(b.ref.status)
    if (byAttention !== 0) return byAttention

    const aDue = a.ref.due || '9999-99-99'
    const bDue = b.ref.due || '9999-99-99'
    if (aDue !== bDue) return aDue.localeCompare(bDue)

    const byPriority = priorityRank(a.ref.priority, priorities) - priorityRank(b.ref.priority, priorities)
    if (byPriority !== 0) return byPriority

    const aLane = sprintMembership(a.ref.tags) === 'next' ? 1 : 0
    const bLane = sprintMembership(b.ref.tags) === 'next' ? 1 : 0
    if (aLane !== bLane) return aLane - bLane
  } else {
    const aDone = a.ref.completed || ''
    const bDone = b.ref.completed || ''
    if (aDone !== bDone) return bDone.localeCompare(aDone)
  }

  return a.ref.title.localeCompare(b.ref.title)
}

export const PM_SPRINT_VIEW_TYPE = 'pm-sprint'

export class SprintView extends ItemView {
  private plugin: PMPlugin
  private toolbarEl!: HTMLElement
  private bodyEl!: HTMLElement
  private reloadDebounceTimer: number | null = null
  private renderGen = 0
  private expandedPastTags = new Set<string>()
  private closingWeek = false

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.navigation = false
  }

  getViewType(): string {
    return PM_SPRINT_VIEW_TYPE
  }

  getDisplayText(): string {
    return 'Sprint'
  }

  getIcon(): string {
    return 'calendar-clock'
  }

  onOpen(): Promise<void> {
    this.containerEl.addClass('pm-view')
    const root = this.contentEl
    root.empty()
    root.addClass('pm-root')
    this.toolbarEl = root.createDiv('pm-toolbar')
    this.bodyEl = root.createDiv('pm-content')
    void this.render()
    this.registerVaultListeners()
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer)
      this.reloadDebounceTimer = null
    }
    return Promise.resolve()
  }

  private registerVaultListeners(): void {
    const scheduleRender = () => {
      if (this.reloadDebounceTimer !== null) window.clearTimeout(this.reloadDebounceTimer)
      this.reloadDebounceTimer = window.setTimeout(() => {
        this.reloadDebounceTimer = null
        void this.render()
      }, 300)
    }
    this.register(this.plugin.index.onChange(scheduleRender))
  }

  async render(): Promise<void> {
    const gen = ++this.renderGen
    this.renderToolbar()
    const details = this.collectDetails()
    if (gen !== this.renderGen) return
    if (this.viewMode() === 'matrix') {
      this.paintMatrix(buildEisenhowerMatrix(this.plugin.index, details))
      return
    }
    const pastTags = listPastSprintTags(this.plugin.index)
    this.paint(
      buildSprintColumn(this.plugin.index, 'current', details),
      buildSprintColumn(this.plugin.index, 'next', details),
      pastTags.map((tag) => buildSprintColumnFromTag(this.plugin.index, tag, details, 'past'))
    )
  }

  private viewMode(): SprintViewMode {
    return this.plugin.settings.sprintViewMode === 'matrix' ? 'matrix' : 'list'
  }

  private matrixLayout(): SprintMatrixLayout {
    return this.plugin.settings.sprintMatrixLayout === 'flat' ? 'flat' : 'tree'
  }

  private async setViewMode(mode: SprintViewMode): Promise<void> {
    if (this.plugin.settings.sprintViewMode === mode) return
    this.plugin.settings.sprintViewMode = mode
    await this.plugin.saveSettings()
    await this.render()
  }

  private async setMatrixLayout(layout: SprintMatrixLayout): Promise<void> {
    if (this.plugin.settings.sprintMatrixLayout === layout) return
    this.plugin.settings.sprintMatrixLayout = layout
    await this.plugin.saveSettings()
    await this.render()
  }

  private renderToolbar(): void {
    this.toolbarEl.empty()
    const left = this.toolbarEl.createDiv('pm-toolbar-left')
    left.createEl('h2', { text: 'Sprint', cls: 'pm-toolbar-title' })
    const right = this.toolbarEl.createDiv('pm-toolbar-right')
    const toggle = right.createDiv('pm-sprint-view-toggle')
    const mode = this.viewMode()
    const listBtn = new ButtonComponent(toggle).setButtonText('List').onClick(
      safeAsync(async () => {
        await this.setViewMode('list')
      })
    )
    const matrixBtn = new ButtonComponent(toggle).setButtonText('Matrix').onClick(
      safeAsync(async () => {
        await this.setViewMode('matrix')
      })
    )
    if (mode === 'list') listBtn.setCta()
    else matrixBtn.setCta()
    if (mode === 'matrix') {
      const layoutToggle = right.createDiv('pm-sprint-view-toggle')
      const layout = this.matrixLayout()
      const treeBtn = new ButtonComponent(layoutToggle).setButtonText('Tree').onClick(
        safeAsync(async () => {
          await this.setMatrixLayout('tree')
        })
      )
      const flatBtn = new ButtonComponent(layoutToggle).setButtonText('Flat').onClick(
        safeAsync(async () => {
          await this.setMatrixLayout('flat')
        })
      )
      if (layout === 'tree') treeBtn.setCta()
      else flatBtn.setCta()
    }
    new ButtonComponent(right).setButtonText('Close week').onClick(
      safeAsync(async () => {
        await this.closeWeek()
      })
    )
    new ButtonComponent(right).setButtonText('Projects').onClick(() => {
      void this.plugin.router.openDashboard()
    })
  }

  private collectDetails(): Map<string, SprintTaskDetails> {
    const details = new Map<string, SprintTaskDetails>()
    const refs = this.plugin.index.allTaskRefs().filter((ref) => {
      if (ref.archived) return false
      return ref.tags.some(
        (tag) => tag === TAG_SPRINT_CURRENT || tag === TAG_SPRINT_NEXT || isPastSprintTag(tag)
      )
    })
    for (const ref of refs) {
      const file = this.plugin.app.vault.getAbstractFileByPath(ref.path)
      if (!(file instanceof TFile)) continue
      details.set(ref.id, detailsFromFrontmatter(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter))
    }
    return details
  }

  private paint(current: SprintColumnModel, next: SprintColumnModel, pastGroups: SprintColumnModel[]): void {
    this.bodyEl.empty()
    this.bodyEl.addClass('pm-sprint')
    this.renderSummary(this.bodyEl, current)
    const columns = this.bodyEl.createDiv('pm-sprint-columns')
    this.renderColumn(columns, current, 'This week')
    this.renderColumn(columns, next, 'Next')
    this.renderPastColumn(columns, pastGroups)
  }

  private paintMatrix(matrix: EisenhowerMatrixModel): void {
    this.bodyEl.empty()
    this.bodyEl.addClass('pm-sprint')
    const liveCount =
      matrix.quadrants.I.cardCount +
      matrix.quadrants.II.cardCount +
      matrix.quadrants.III.cardCount +
      matrix.quadrants.IV.cardCount +
      matrix.unsorted.cardCount
    const line = this.bodyEl.createDiv('pm-sprint-summary')
    line.setText(`Matrix · ${liveCount} ${liveCount === 1 ? 'card' : 'cards'}`)
    const grid = this.bodyEl.createDiv('pm-sprint-matrix')
    const order: EisenhowerQuadrant[] = ['I', 'II', 'III', 'IV']
    for (const quad of order) {
      this.renderMatrixQuadrant(grid, quad, matrix.quadrants[quad])
    }
    if (matrix.unsorted.cardCount > 0) {
      const unsorted = this.bodyEl.createDiv('pm-sprint-unsorted')
      const header = unsorted.createDiv('pm-sprint-col-header')
      header.createEl('h3', { text: 'Unsorted', cls: 'pm-sprint-col-title' })
      header.createSpan({
        cls: 'pm-sprint-col-meta',
        text: `${matrix.unsorted.cardCount} cards · set Urgency to place`
      })
      this.renderColumnBody(unsorted, matrix.unsorted, this.matrixLayout() === 'flat')
    }
  }

  private renderMatrixQuadrant(parent: HTMLElement, quad: EisenhowerQuadrant, model: SprintColumnModel): void {
    const col = parent.createDiv('pm-sprint-col pm-sprint-matrix-cell')
    const qn = quad === 'I' ? '1' : quad === 'II' ? '2' : quad === 'III' ? '3' : '4'
    col.addClass(`pm-sprint-matrix-cell--q${qn}`)
    const header = col.createDiv('pm-sprint-col-header')
    header.createEl('h3', {
      text: `${quad} · ${EISENHOWER_QUADRANT_LABELS[quad]}`,
      cls: `pm-sprint-col-title pm-sprint-matrix-title--q${qn}`
    })
    header.createSpan({
      cls: 'pm-sprint-col-meta',
      text: `${model.cardCount} · ${this.hoursMeta(model)}`
    })
    this.renderColumnBody(col, model, this.matrixLayout() === 'flat')
  }

  private renderSummary(parent: HTMLElement, current: SprintColumnModel): void {
    const line = parent.createDiv('pm-sprint-summary')
    const bits = [
      `${current.cardCount} ${current.cardCount === 1 ? 'card' : 'cards'}`,
      this.hoursMeta(current)
    ]
    line.setText(`This week · ${bits.join(' · ')}`)
  }

  /** Agent hours, Jon hours, then the estimate: `6.7h (agent) / 3.9h (Jon) / 8.3h`. */
  private hoursMeta(model: SprintColumnModel): string {
    return `${model.hours.agent}h (agent) / ${model.hours.jon}h (Jon) / ${model.estimate}h`
  }

  private renderColumn(parent: HTMLElement, model: SprintColumnModel, title: string): void {
    const col = parent.createDiv('pm-sprint-col')
    const header = col.createDiv('pm-sprint-col-header')
    header.createEl('h3', { text: title, cls: 'pm-sprint-col-title' })
    header.createSpan({
      cls: 'pm-sprint-col-meta',
      text: `${model.cardCount} cards · ${this.hoursMeta(model)}`
    })
    this.renderColumnBody(col, model)
  }

  private renderPastColumn(parent: HTMLElement, groups: SprintColumnModel[]): void {
    const col = parent.createDiv('pm-sprint-col')
    const header = col.createDiv('pm-sprint-col-header')
    header.createEl('h3', { text: 'Past', cls: 'pm-sprint-col-title' })
    const cards = groups.reduce((sum, group) => sum + group.cardCount, 0)
    header.createSpan({
      cls: 'pm-sprint-col-meta',
      text: groups.length === 0 ? 'No cards in this column.' : `${groups.length} sprints · ${cards} cards`
    })
    const body = col.createDiv('pm-sprint-col-body')
    if (groups.length === 0) {
      body.createDiv({ cls: 'pm-sprint-empty', text: 'No cards in this column.' })
      return
    }
    for (const group of groups) this.renderPastGroup(body, group)
  }

  private renderPastGroup(parent: HTMLElement, model: SprintColumnModel): void {
    const block = parent.createDiv('pm-sprint-past-group')
    const collapsed = !this.expandedPastTags.has(model.tag)
    const head = block.createDiv('pm-sprint-past-group-head')
    new CollapseToggle(head, {
      collapsed,
      subject: model.tag,
      onToggle: (e) => {
        e.stopPropagation()
        this.togglePastGroup(model.tag)
      }
    })
    head.createSpan({ cls: 'pm-sprint-past-group-title', text: model.tag })
    head.createSpan({
      cls: 'pm-sprint-col-meta',
      text: `${model.cardCount} cards · ${this.hoursMeta(model)}`
    })
    head.addEventListener('click', () => this.togglePastGroup(model.tag))
    if (collapsed) return
    if (model.projects.length === 0) {
      block.createDiv({ cls: 'pm-sprint-empty', text: 'No cards in this column.' })
      return
    }
    const inner = block.createDiv('pm-sprint-past-group-body')
    for (const project of model.projects) this.renderProject(inner, project, 0)
  }

  private togglePastGroup(tag: string): void {
    if (this.expandedPastTags.has(tag)) this.expandedPastTags.delete(tag)
    else this.expandedPastTags.add(tag)
    void this.render()
  }

  private renderColumnBody(col: HTMLElement, model: SprintColumnModel, flat = false): void {
    const body = col.createDiv('pm-sprint-col-body')
    if (model.projects.length === 0) {
      body.createDiv({ cls: 'pm-sprint-empty', text: 'No cards in this column.' })
      return
    }
    if (flat) {
      this.renderFlatTasks(body, model)
      return
    }
    for (const project of model.projects) this.renderProject(body, project, 0)
  }

  private collectFlatTasks(model: SprintColumnModel): SprintTaskNode[] {
    const out: SprintTaskNode[] = []
    const walkTask = (node: SprintTaskNode): void => {
      if (!node.groupingOnly) out.push(node)
      for (const child of node.children) walkTask(child)
    }
    const walkProject = (node: SprintProjectNode): void => {
      for (const task of node.tasks) walkTask(task)
      for (const child of node.children) walkProject(child)
    }
    for (const project of model.projects) walkProject(project)
    const statuses = this.plugin.settings.statuses
    const priorities = this.plugin.settings.priorities
    out.sort((a, b) => compareFlatSprintTasks(a, b, statuses, priorities))
    return out
  }

  private hierarchyParts(ref: TaskRef): string[] {
    const parts: string[] = []
    if (ref.projectPath) {
      for (const ancestor of this.plugin.index.ancestorRefs(ref.projectPath)) {
        parts.push(ancestor.title)
      }
      const self = this.plugin.index.projectRef(ref.projectPath)
      if (self) parts.push(self.title)
    }
    const parentTitles: string[] = []
    let parentId = ref.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = this.plugin.index.task(parentId)
      if (!parent) break
      parentTitles.unshift(clipWords(parent.title, 4))
      parentId = parent.parentId
    }
    parts.push(...parentTitles)
    return parts
  }

  private pathLabel(ref: TaskRef): string {
    const parts = this.hierarchyParts(ref)
    if (parts.length === 0) return 'Other'
    if (parts.length <= 2) return parts.join(' › ')
    return `${parts[0]} › ${parts[parts.length - 1]}`
  }

  private pathChipColor(ref: TaskRef): string {
    if (!ref.projectPath) return 'var(--text-muted)'
    return this.plugin.index.projectRef(ref.projectPath)?.color ?? 'var(--text-muted)'
  }

  private renderFlatTasks(parent: HTMLElement, model: SprintColumnModel): void {
    const tasks = this.collectFlatTasks(model)
    if (tasks.length === 0) {
      parent.createDiv({ cls: 'pm-sprint-empty', text: 'No cards in this column.' })
      return
    }
    const list = parent.createDiv('pm-sprint-tasks')
    for (const task of tasks) this.renderTask(list, task, 0, { flat: true })
  }

  private renderProject(parent: HTMLElement, node: SprintProjectNode, depth: number): void {
    const block = parent.createDiv('pm-sprint-project')
    block.toggleClass('pm-sprint-project--nested', depth > 0)
    const hasBody = node.children.length > 0 || node.tasks.length > 0
    const collapsed = hasBody && this.plugin.isProjectCollapsed(node.ref.path)
    const head = block.createDiv('pm-sprint-project-head')
    if (hasBody) {
      new CollapseToggle(head, {
        collapsed,
        subject: 'contents',
        onToggle: (e) => {
          e.stopPropagation()
          void this.plugin.toggleProjectCollapsed(node.ref.path).then(() => this.render())
        }
      })
    }
    renderGlyph(head.createSpan({ cls: 'pm-sprint-project-icon' }), { icon: node.ref.icon, color: node.ref.color })
    head.createSpan({ cls: 'pm-sprint-project-title', text: node.ref.title })
    renderTimeChip(head, node.logged, node.estimate, 'sm')
    head.addEventListener(
      'click',
      safeAsync(() => this.plugin.router.openProjectLink(node.ref.path))
    )
    if (collapsed) return
    const tasks = block.createDiv('pm-sprint-tasks')
    for (const task of node.tasks) this.renderTask(tasks, task, 0)
    for (const child of node.children) this.renderProject(block, child, depth + 1)
  }

  private renderTask(
    parent: HTMLElement,
    node: SprintTaskNode,
    depth: number,
    opts: { flat?: boolean } = {}
  ): void {
    const flat = Boolean(opts.flat)
    const row = parent.createDiv('pm-sprint-task')
    if (flat) row.addClass('pm-sprint-task--flat')
    if (!flat && depth > 0) row.addClass('pm-sprint-task--child')
    if (node.groupingOnly) row.addClass('pm-sprint-task--group')
    const hasChildren = !flat && node.children.length > 0
    const collapsed = hasChildren && this.isTaskCollapsed(node)
    if (hasChildren) row.addClass('pm-sprint-task--collapsible')
    if (hasChildren) {
      new CollapseToggle(row, {
        collapsed,
        subject: 'subtasks',
        onToggle: (e) => {
          e.stopPropagation()
          void this.toggleTaskCollapsed(node)
        }
      })
    }

    const main = flat ? row.createDiv('pm-sprint-task-main') : row
    if (!node.groupingOnly) {
      const statuses = this.plugin.settings.statuses
      if (isTerminalStatus(node.ref.status, statuses)) row.addClass('pm-sprint-task--done')
      renderStatusBadgeFromId(
        main,
        node.ref.status,
        statuses,
        (status) => {
          void this.changeTaskStatus(node, status)
        },
        'sm'
      )
    }
    main.createSpan({ cls: 'pm-sprint-task-title', text: node.ref.title })
    if (!node.groupingOnly) {
      if (node.ref.type === 'milestone') {
        new Chip(main)
          .setLabel('M')
          .setVariant('solid')
          .setSize('sm')
          .setColor('var(--color-purple)')
          .setTooltip('Milestone')
      }
      if (node.ref.type === 'subtask') {
        new Chip(main)
          .setLabel('Sub')
          .setVariant('solid')
          .setSize('sm')
          .setColor('var(--color-green)')
          .setTooltip('Subtask')
      }
      if (flat) {
        new Chip(main)
          .setLabel(this.pathLabel(node.ref))
          .setVariant('solid')
          .setSize('sm')
          .setDot(true)
          .setColor(this.pathChipColor(node.ref))
      }
      const meta = flat ? main.createDiv('pm-sprint-task-meta') : main
      const lane = sprintMembership(node.ref.tags)
      if (lane === 'next' || (!flat && lane === 'current')) {
        new Chip(meta)
          .setLabel(lane === 'current' ? 'This week' : 'Next')
          .setSize('sm')
          .setVariant('outline')
      }
      if (node.ref.due) {
        const terminal = isTerminalStatus(node.ref.status, this.plugin.settings.statuses)
        const urgency = terminal ? 'normal' : dateUrgency(node.ref.due, true)
        renderDueChip(meta, formatDateShort(node.ref.due), urgency, 'sm')
      }
      renderTimeChip(meta, node.logged, node.estimate, 'sm')
      if (!flat && (node.hours.agent > 0 || node.hours.jon > 0)) {
        meta.createSpan({
          cls: 'pm-sprint-task-actors',
          text: `agent ${node.hours.agent}h · Jon ${node.hours.jon}h`
        })
      }
    } else {
      renderTimeChip(main, node.logged, node.estimate, 'sm')
    }
    if (node.groupingOnly && hasChildren) {
      row.addEventListener(
        'click',
        safeAsync(() => this.toggleTaskCollapsed(node))
      )
    } else if (!node.groupingOnly) {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (target.closest('.pm-chip--interactive')) return
        void this.openTask(node)
      })
    }
    if (flat || collapsed) return
    for (const child of node.children) this.renderTask(parent, child, depth + 1)
  }

  private isTaskCollapsed(node: SprintTaskNode): boolean {
    const path = node.ref.projectPath
    if (!path) return false
    return (this.plugin.settings.collapsedTasks[path] ?? []).includes(node.ref.id)
  }

  private async toggleTaskCollapsed(node: SprintTaskNode): Promise<void> {
    const path = node.ref.projectPath
    if (!path) return
    const ids = new Set(this.plugin.settings.collapsedTasks[path] ?? [])
    if (ids.has(node.ref.id)) ids.delete(node.ref.id)
    else ids.add(node.ref.id)
    this.plugin.settings.collapsedTasks[path] = [...ids]
    await this.plugin.saveSettings()
    await this.render()
  }

  private async closeWeek(): Promise<void> {
    if (this.closingWeek) return
    const current = sprintMembers(this.plugin.index, 'current')
    const next = sprintMembers(this.plugin.index, 'next')
    const tag = pastSprintTag(today())
    const copy = closeWeekConfirmCopy(current.length, next.length, tag)
    if (!(await confirmDialog(this.app, copy.message, copy.confirmLabel))) return
    this.closingWeek = true
    try {
      const withPath = (refs: typeof current) => {
        const rows: { id: string; projectPath: string }[] = []
        for (const ref of refs) {
          if (!ref.projectPath) continue
          rows.push({ id: ref.id, projectPath: ref.projectPath })
        }
        return rows
      }
      await writeCloseWeek(
        this.plugin.store,
        (path) => this.plugin.store.loadProjectByPath(path),
        withPath(current),
        withPath(next),
        tag
      )
      await this.render()
    } finally {
      this.closingWeek = false
    }
  }

  private async changeTaskStatus(node: SprintTaskNode, status: TaskStatus): Promise<void> {
    const path = node.ref.projectPath
    if (!path) return
    const project = await this.plugin.store.loadProjectByPath(path)
    if (!project) return
    await this.plugin.store.updateTask(project, node.ref.id, { status })
    await this.render()
  }

  private async openTask(node: SprintTaskNode): Promise<void> {
    const path = node.ref.projectPath
    if (!path) {
      await this.plugin.router.openTask({ filePath: node.ref.path })
      return
    }
    const project = await this.plugin.store.loadProjectByPath(path)
    if (!project) {
      await this.plugin.router.openTask({ filePath: node.ref.path })
      return
    }
    const task = findTask(project.tasks, node.ref.id)
    if (!task) {
      await this.plugin.router.openTask({ filePath: node.ref.path })
      return
    }
    openTaskModal(this.plugin, project, {
      task,
      onSave: async () => {
        await this.render()
      }
    })
  }
}
