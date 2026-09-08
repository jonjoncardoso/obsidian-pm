import { ButtonComponent, ItemView, TFile, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import { safeAsync } from '../utils'
import { openTaskModal } from '../ui/ModalFactory'
import { CollapseToggle } from '../ui/primitives/CollapseToggle'
import { renderGlyph } from '../ui/composites/properties'
import { renderTimeChip } from '../ui/composites/timeChip'
import { findTask } from '../store/TaskTreeOps'
import {
  buildSprintColumn,
  detailsFromFrontmatter,
  type SprintColumnModel,
  type SprintProjectNode,
  type SprintTaskDetails,
  type SprintTaskNode
} from '../store/sprintBoard'
import { TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT } from '../store/sprintTags'

export const PM_SPRINT_VIEW_TYPE = 'pm-sprint'

export class SprintView extends ItemView {
  private plugin: PMPlugin
  private toolbarEl!: HTMLElement
  private bodyEl!: HTMLElement
  private reloadDebounceTimer: number | null = null
  private renderGen = 0

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
    this.paint(
      buildSprintColumn(this.plugin.index, 'current', details),
      buildSprintColumn(this.plugin.index, 'next', details)
    )
  }

  private renderToolbar(): void {
    this.toolbarEl.empty()
    const left = this.toolbarEl.createDiv('pm-toolbar-left')
    left.createEl('h2', { text: 'Sprint', cls: 'pm-toolbar-title' })
    const right = this.toolbarEl.createDiv('pm-toolbar-right')
    new ButtonComponent(right).setButtonText('Projects').onClick(() => {
      void this.plugin.router.openDashboard()
    })
  }

  private collectDetails(): Map<string, SprintTaskDetails> {
    const details = new Map<string, SprintTaskDetails>()
    const refs = this.plugin.index
      .allTaskRefs()
      .filter(
        (ref) => !ref.archived && (ref.tags.includes(TAG_SPRINT_CURRENT) || ref.tags.includes(TAG_SPRINT_NEXT))
      )
    for (const ref of refs) {
      const file = this.plugin.app.vault.getAbstractFileByPath(ref.path)
      if (!(file instanceof TFile)) continue
      details.set(ref.id, detailsFromFrontmatter(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter))
    }
    return details
  }

  private paint(current: SprintColumnModel, next: SprintColumnModel): void {
    this.bodyEl.empty()
    this.bodyEl.addClass('pm-sprint')
    this.renderSummary(this.bodyEl, current)
    const columns = this.bodyEl.createDiv('pm-sprint-columns')
    this.renderColumn(columns, current, 'This week')
    this.renderColumn(columns, next, 'Next')
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
    const title = node.ref.title
    const done = node.ref.status === 'done' || node.ref.status === 'cancelled'
    const label = done && !node.groupingOnly ? `${title} (${node.ref.status})` : title
    row.createSpan({ cls: 'pm-sprint-task-title', text: label })
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
      row.addEventListener(
        'click',
        safeAsync(() => this.openTask(node))
      )
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
