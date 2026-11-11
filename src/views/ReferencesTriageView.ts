import { Menu } from 'obsidian'
import type PMPlugin from '../main'
import type { FilterState, Task } from '../types'
import { personKeyer, type ProjectScope } from '../store'
import { matchesFilter } from '../store/TaskFilter'
import {
  TRIAGE_LANES,
  buildTriageCards,
  groupByLane,
  type StepFill,
  type TriageCard
} from '../store/attentionTriage'
import { parsePlainDate, today } from '../dates'
import { displayName, dueUrgency } from '../utils'
import { openTaskModal } from '../ui/ModalFactory'
import { buildTaskContextMenu } from '../ui/TaskContextMenu'
import type { SubView } from './SubView'

function todayIso(): string {
  return today().toString()
}

/** "11 Nov 2026" */
function formatTriageDate(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export class ReferencesTriageView implements SubView {
  private personKey: (raw: string) => string = displayName

  constructor(
    private container: HTMLElement,
    private scope: ProjectScope,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    private filter: FilterState
  ) {}

  render(): void {
    void this.renderAsync()
  }

  refresh(): void {
    this.render()
  }

  private async renderAsync(): Promise<void> {
    this.personKey = personKeyer(this.plugin.app)
    const roots = this.scope
      .tasks()
      .filter((t) => matchesFilter(t, this.filter, this.scope.config.statuses, this.personKey))

    const needBody = collectStepTasks(roots).filter((t) => t.filePath && !t.description.includes('template_step_id:'))
    if (needBody.length) {
      await Promise.all(needBody.map((t) => this.plugin.store.loadTaskBody(t)))
    }

    this.container.empty()
    this.container.addClass('pm-triage-view')

    const cards = buildTriageCards(roots, this.scope.config.statuses, todayIso())
    const groups = groupByLane(cards)

    const board = this.container.createDiv('pm-triage-board')
    for (const lane of TRIAGE_LANES) {
      const laneEl = board.createDiv('pm-triage-lane')
      const header = laneEl.createDiv('pm-triage-lane-header')
      header.createSpan({ text: lane.label, cls: 'pm-triage-lane-title' })
      header.createSpan({ text: String(groups[lane.id].length), cls: 'pm-triage-lane-count' })
      const row = laneEl.createDiv('pm-triage-lane-cards')
      if (!groups[lane.id].length) {
        row.createDiv({ text: 'None', cls: 'pm-triage-empty' })
        continue
      }
      for (const card of groups[lane.id]) {
        this.renderCard(row, card)
      }
    }

    this.renderLegend(this.container.createDiv('pm-triage-legend'))
  }

  private renderCard(parent: HTMLElement, card: TriageCard): void {
    const el = parent.createDiv('pm-triage-card')
    el.setAttrs({ role: 'button', tabindex: '0' })

    el.createDiv({ text: card.parent.title, cls: 'pm-triage-card-title' })

    const next = el.createDiv({ text: card.nextAction, cls: 'pm-triage-card-next' })
    if (card.nextTask) {
      next.addClass('pm-triage-card-next--link')
      next.setAttr('title', 'Open this step')
      next.addEventListener('click', (e) => {
        e.stopPropagation()
        this.openTask(card.nextTask!)
      })
    }

    const pipeline = el.createDiv('pm-triage-pipeline')
    this.renderStepStrip(pipeline.createDiv('pm-triage-steps'), card)

    const meta = el.createDiv('pm-triage-card-meta')
    if (card.due) {
      const due = meta.createSpan({ text: formatTriageDate(card.due), cls: 'pm-triage-due' })
      if (dueUrgency({ ...card.parent, due: card.due }, this.scope.config.statuses) === 'overdue') {
        due.addClass('pm-triage-due--overdue')
      }
    }

    el.addEventListener('click', () => this.openTask(card.parent))
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.openTask(card.parent)
      }
    })
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.openContextMenu(card.parent, e)
    })
  }

  private renderStepStrip(parent: HTMLElement, card: TriageCard): void {
    card.steps.forEach((step, index) => {
      const col = parent.createDiv('pm-triage-step-col')
      if (!step.panes.length) {
        col.createDiv('pm-triage-step pm-triage-step--empty')
        return
      }

      const multi = step.panes.length > 1
      step.panes.forEach((pane) => {
        const square = col.createDiv('pm-triage-step')
        square.addClass(`pm-triage-step--${pane.fill}`)
        if (index === card.currentStepIndex && pane.fill === 'current') {
          square.addClass('pm-triage-step--active')
        }
        if (multi && pane.label) {
          square.createSpan({ text: pane.label, cls: 'pm-triage-step-label' })
        }
        square.setAttr('title', pane.task.title)
        square.addEventListener('click', (e) => {
          e.stopPropagation()
          this.openTask(pane.task)
        })

        if (index === card.currentStepIndex && pane.fill === 'current' && card.hours.total > 0) {
          this.renderHoursStrip(col.createDiv('pm-triage-hour-slot'), card.hours.filled, card.hours.total)
        }
      })
    })
  }

  private renderHoursStrip(parent: HTMLElement, filled: number, total: number): void {
    const strip = parent.createDiv('pm-triage-hours')
    for (let h = 0; h < total; h++) {
      const hour = strip.createDiv('pm-triage-hour')
      if (h < filled) hour.addClass('pm-triage-hour--filled')
    }
  }

  private renderLegend(parent: HTMLElement): void {
    parent.createDiv({ text: 'Legend', cls: 'pm-triage-legend-title' })
    const row = parent.createDiv('pm-triage-legend-row')
    addLegendSwatch(row, 'empty', 'Not started')
    addLegendSwatch(row, 'current', 'Current or due soon')
    addLegendSwatch(row, 'done', 'Done')
    addLegendSwatch(row, 'waiting', 'Waiting / cancelled')
    const split = row.createDiv('pm-triage-legend-item')
    const stack = split.createDiv('pm-triage-legend-stack')
    for (const label of ['5.1', '5.2']) {
      const sq = stack.createDiv('pm-triage-step pm-triage-legend-sample')
      sq.addClass(label === '5.1' ? 'pm-triage-step--done' : 'pm-triage-step--empty')
      sq.createSpan({ text: label, cls: 'pm-triage-step-label' })
    }
    split.createSpan({ text: 'Programme stack opens that stage', cls: 'pm-triage-legend-label' })
    const hours = row.createDiv('pm-triage-legend-item')
    const hoursSample = hours.createDiv('pm-triage-hours pm-triage-legend-hours')
    hoursSample.createDiv('pm-triage-hour pm-triage-hour--filled')
    hoursSample.createDiv('pm-triage-hour pm-triage-hour--filled')
    hoursSample.createDiv('pm-triage-hour')
    hours.createSpan({ text: 'Hours under the current programme', cls: 'pm-triage-legend-label' })
  }

  private openTask(task: Task): void {
    const owner = this.scope.projectOf(task.id)
    if (!owner) return
    openTaskModal(this.plugin, owner, {
      task,
      onSave: async () => {
        await this.onRefresh()
      }
    })
  }

  private openContextMenu(task: Task, e: MouseEvent): void {
    const owner = this.scope.projectOf(task.id)
    if (!owner) return
    const menu = new Menu()
    buildTaskContextMenu(menu, task, {
      plugin: this.plugin,
      project: owner,
      onRefresh: this.onRefresh
    })
    menu.showAtMouseEvent(e)
  }
}

function collectStepTasks(roots: Task[]): Task[] {
  const out: Task[] = []
  for (const root of roots) {
    for (const child of root.subtasks) {
      out.push(child)
      for (const nested of child.subtasks) out.push(nested)
    }
  }
  return out
}

function addLegendSwatch(parent: HTMLElement, fill: StepFill, label: string): void {
  const item = parent.createDiv('pm-triage-legend-item')
  const swatch = item.createDiv('pm-triage-step')
  swatch.addClass(`pm-triage-step--${fill}`)
  swatch.addClass('pm-triage-legend-sample')
  item.createSpan({ text: label, cls: 'pm-triage-legend-label' })
}
