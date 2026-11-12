import { Menu, setIcon } from 'obsidian'
import type PMPlugin from '../main'
import type { FilterState, Task } from '../types'
import { personKeyer, type ProjectScope } from '../store'
import { matchesFilter } from '../store/TaskFilter'
import {
  TRIAGE_LANES,
  buildTriageCards,
  dueWithinDays,
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
  private completedOpen = false

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
      const laneEl = board.createDiv(`pm-triage-lane pm-triage-lane--${lane.id}`)
      const header = laneEl.createDiv('pm-triage-lane-header')
      const collapsible = lane.id === 'completed'
      if (collapsible) {
        const icon = header.createSpan('pm-triage-lane-toggle-icon')
        setIcon(icon, this.completedOpen ? 'chevron-down' : 'chevron-right')
      }
      header.createSpan({ text: lane.label, cls: 'pm-triage-lane-title' })
      header.createSpan({ text: String(groups[lane.id].length), cls: 'pm-triage-lane-count' })
      if (collapsible) {
        header.addClass('pm-triage-lane-header--toggle')
        header.setAttrs({
          role: 'button',
          tabindex: '0',
          'aria-expanded': String(this.completedOpen),
          'aria-label': `${lane.label}, ${groups[lane.id].length} students, ${this.completedOpen ? 'shown' : 'hidden'}`
        })
        const toggle = () => {
          this.completedOpen = !this.completedOpen
          this.render()
        }
        header.addEventListener('click', toggle)
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        })
        if (!this.completedOpen) {
          laneEl.addClass('pm-triage-lane--collapsed')
          continue
        }
      }
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
    if (card.lane === 'completed') el.addClass('pm-triage-card--completed')
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
      meta.createSpan({ text: 'Next deadline', cls: 'pm-triage-due-label' })
      const soon = dueWithinDays(card.due, todayIso(), 3)
      const dateText = formatTriageDate(card.due)
      const due = meta.createSpan({ text: soon ? `⚠️ ${dateText}` : dateText, cls: 'pm-triage-due' })
      if (dueUrgency({ ...card.parent, due: card.due }, this.scope.config.statuses) === 'overdue') {
        due.addClass('pm-triage-due--overdue')
      } else if (soon) {
        due.addClass('pm-triage-due--soon')
      }
      if (soon) due.setAttr('aria-label', `Next deadline ${dateText}, within three days`)
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
          const text = pane.fill === 'done' ? `✓${pane.label}` : pane.label
          square.createSpan({ text, cls: 'pm-triage-step-label' })
        } else if (pane.fill === 'done') {
          setIcon(square.createSpan('pm-triage-step-glyph'), 'check')
        } else if (pane.fill === 'blocked') {
          setIcon(square.createSpan('pm-triage-step-glyph'), 'lock')
        } else {
          square.createSpan({ text: String(index + 1), cls: 'pm-triage-step-glyph pm-triage-step-number' })
        }
        const label = this.stepLabel(pane.task)
        square.setAttrs({ title: label, 'aria-label': label, role: 'button', tabindex: '0' })
        square.addEventListener('click', (e) => {
          e.stopPropagation()
          this.openTask(pane.task)
        })
        square.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            this.openTask(pane.task)
          }
        })

        if (index === card.currentStepIndex && pane.fill === 'current' && card.hours.total > 0) {
          this.renderHoursStrip(col.createDiv('pm-triage-hour-slot'), card.hours.filled, card.hours.total)
        }
      })
    })
  }

  /** "3. Ingest evidence, To Do, due 12 Nov 2026" for the tooltip and screen readers. */
  private stepLabel(task: Task): string {
    const status = this.scope.config.statuses.find((s) => s.id === task.status)?.label ?? task.status
    const due = task.due ? `, due ${formatTriageDate(task.due)}` : ''
    return `${task.title}, ${status}${due}`
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
    addLegendSwatch(row, 'empty', 'Not started', '1')
    addLegendSwatch(row, 'current', 'Next step', '3')
    addLegendSwatch(row, 'done', 'Done', 'check')
    addLegendSwatch(row, 'blocked', 'Blocked until an earlier step is done', 'lock')
    addLegendSwatch(row, 'waiting', 'Cancelled')
    const warn = row.createDiv('pm-triage-legend-item')
    warn.createSpan({ text: '⚠️ 12 Nov', cls: 'pm-triage-due pm-triage-due--soon' })
    warn.createSpan({ text: 'Next deadline within three days', cls: 'pm-triage-legend-label' })
    const split = row.createDiv('pm-triage-legend-item')
    const stack = split.createDiv('pm-triage-legend-stack')
    for (const label of ['5.1', '5.2']) {
      const sq = stack.createDiv('pm-triage-step pm-triage-legend-sample')
      sq.addClass(label === '5.1' ? 'pm-triage-step--done' : 'pm-triage-step--empty')
      sq.createSpan({ text: label, cls: 'pm-triage-step-label' })
    }
    split.createSpan({ text: '5.1, 5.2 …: one card per programme portal, under step 5', cls: 'pm-triage-legend-label' })
    const hours = row.createDiv('pm-triage-legend-item')
    const hoursSample = hours.createDiv('pm-triage-hours pm-triage-legend-hours')
    hoursSample.createDiv('pm-triage-hour pm-triage-hour--filled')
    hoursSample.createDiv('pm-triage-hour pm-triage-hour--filled')
    hoursSample.createDiv('pm-triage-hour')
    hours.createSpan({ text: 'Hours logged on the next step (filled) out of the estimate', cls: 'pm-triage-legend-label' })
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

function addLegendSwatch(parent: HTMLElement, fill: StepFill, label: string, glyph?: string): void {
  const item = parent.createDiv('pm-triage-legend-item')
  const swatch = item.createDiv('pm-triage-step')
  swatch.addClass(`pm-triage-step--${fill}`)
  swatch.addClass('pm-triage-legend-sample')
  if (glyph === 'check' || glyph === 'lock') setIcon(swatch.createSpan('pm-triage-step-glyph'), glyph)
  else if (glyph) swatch.createSpan({ text: glyph, cls: 'pm-triage-step-glyph pm-triage-step-number' })
  item.createSpan({ text: label, cls: 'pm-triage-legend-label' })
}
