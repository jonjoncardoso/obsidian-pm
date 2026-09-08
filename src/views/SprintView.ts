import { ButtonComponent, ItemView, TFile, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import { today } from '../dates'
import { isTerminalStatus, safeAsync } from '../utils'
import type { TaskStatus } from '../types'
import { confirmDialog, openTaskModal } from '../ui/ModalFactory'
import { CollapseToggle } from '../ui/primitives/CollapseToggle'
import { renderGlyph } from '../ui/composites/properties'
import { renderTimeChip } from '../ui/composites/timeChip'
import { renderStatusBadgeFromId } from '../ui/StatusBadge'
import { findTask } from '../store/TaskTreeOps'
import {
  buildSprintColumn,
  buildSprintColumnFromTag,
  detailsFromFrontmatter,
  listPastSprintTags,
  sprintMembers,
  type SprintColumnModel,
  type SprintProjectNode,
  type SprintTaskDetails,
  type SprintTaskNode
} from '../store/sprintBoard'
import { closeWeekConfirmCopy, writeCloseWeek } from '../store/sprintApply'
import { isPastSprintTag, pastSprintTag, TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT } from '../store/sprintTags'

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
    const pastTags = listPastSprintTags(this.plugin.index)
    const details = this.collectDetails()
    if (gen !== this.renderGen) return
    this.paint(
      buildSprintColumn(this.plugin.index, 'current', details),
      buildSprintColumn(this.plugin.index, 'next', details),
      pastTags.map((tag) => buildSprintColumnFromTag(this.plugin.index, tag, details, 'past'))
    )
  }

  private renderToolbar(): void {
    this.toolbarEl.empty()
    const left = this.toolbarEl.createDiv('pm-toolbar-left')
    left.createEl('h2', { text: 'Sprint', cls: 'pm-toolbar-title' })
    const right = this.toolbarEl.createDiv('pm-toolbar-right')
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

  private renderSummary(parent: HTMLElement, current: SprintColumnModel): void {
    const line = parent.createDiv('pm-sprint-summary')
    const bits = [
      `${current.cardCount} ${current.cardCount === 1 ? 'card' : 'cards'}`,
      `${current.logged}h / ${current.estimate}h planned`,
      `agent ${current.hours.agent}h`,
      `Jon ${current.hours.jon}h`
    ]
    line.setText(`This week · ${bits.join(' · ')}`)
  }

  private renderColumn(parent: HTMLElement, model: SprintColumnModel, title: string): void {
    const col = parent.createDiv('pm-sprint-col')
    const header = col.createDiv('pm-sprint-col-header')
    header.createEl('h3', { text: title, cls: 'pm-sprint-col-title' })
    header.createSpan({
      cls: 'pm-sprint-col-meta',
      text: `${model.cardCount} cards · ${model.logged} / ${model.estimate}h`
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
      text: `${model.cardCount} cards · ${model.logged} / ${model.estimate}h`
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

  private renderColumnBody(col: HTMLElement, model: SprintColumnModel): void {
    const body = col.createDiv('pm-sprint-col-body')
    if (model.projects.length === 0) {
      body.createDiv({ cls: 'pm-sprint-empty', text: 'No cards in this column.' })
      return
    }
    for (const project of model.projects) this.renderProject(body, project, 0)
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
    head.addEventListener(
      'click',
      safeAsync(() => this.plugin.router.openProjectLink(node.ref.path))
    )
    if (collapsed) return
    const tasks = block.createDiv('pm-sprint-tasks')
    for (const task of node.tasks) this.renderTask(tasks, task, 0)
    for (const child of node.children) this.renderProject(block, child, depth + 1)
  }

  private renderTask(parent: HTMLElement, node: SprintTaskNode, depth: number): void {
    const row = parent.createDiv('pm-sprint-task')
    if (depth > 0) row.addClass('pm-sprint-task--child')
    if (node.groupingOnly) row.addClass('pm-sprint-task--group')
    const hasChildren = node.children.length > 0
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
    if (!node.groupingOnly) {
      const statuses = this.plugin.settings.statuses
      if (isTerminalStatus(node.ref.status, statuses)) row.addClass('pm-sprint-task--done')
      renderStatusBadgeFromId(
        row,
        node.ref.status,
        statuses,
        (status) => {
          void this.changeTaskStatus(node, status)
        },
        'sm'
      )
    }
    row.createSpan({ cls: 'pm-sprint-task-title', text: node.ref.title })
    if (!node.groupingOnly) {
      renderTimeChip(row, node.logged, node.estimate, 'sm')
      if (node.hours.agent > 0 || node.hours.jon > 0) {
        row.createSpan({
          cls: 'pm-sprint-task-actors',
          text: `agent ${node.hours.agent}h · Jon ${node.hours.jon}h`
        })
      }
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
    if (collapsed) return
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
