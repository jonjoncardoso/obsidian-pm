import { Menu } from 'obsidian'
import type PMPlugin from '../main'
import type { FilterState, Task } from '../types'
import { personKeyer, type ProjectScope } from '../store'
import { matchesFilter } from '../store/TaskFilter'
import {
  EMAIL_TRIAGE_LANES,
  buildEmailTriageCards,
  dueWithinDays,
  groupEmailByLane,
  type EmailLaneId,
  type EmailTriageCard
} from '../store/emailTriage'
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

export class EmailTriageView implements SubView {
  private personKey: (raw: string) => string = displayName
  private parkedOpen = false

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

    const toLoad = collectBodies(roots).filter((t) => t.filePath)
    this.container.empty()
    this.container.addClass('pm-email-triage-view')
    if (toLoad.length) {
      this.container.createDiv({ text: 'Loading…', cls: 'pm-email-triage-loading' })
      await Promise.all(toLoad.map((t) => this.plugin.store.loadTaskBody(t)))
      this.container.empty()
      this.container.addClass('pm-email-triage-view')
    }

    const cards = buildEmailTriageCards(roots, this.scope.config.statuses)
    const groups = groupEmailByLane(cards)

    const board = this.container.createDiv('pm-email-triage-board')
    const acts = EMAIL_TRIAGE_LANES[0]
    this.renderLane(board, acts.id, acts.label, acts.subtitle, groups[acts.id])
    const side = board.createDiv('pm-email-triage-side')
    for (const lane of EMAIL_TRIAGE_LANES.slice(1)) {
      this.renderLane(side, lane.id, lane.label, lane.subtitle, groups[lane.id])
    }
  }

  private renderLane(
    parent: HTMLElement,
    id: EmailLaneId,
    label: string,
    subtitle: string,
    cards: EmailTriageCard[]
  ): void {
    const laneEl = parent.createDiv(`pm-email-triage-lane pm-email-triage-lane--${id}`)
    const collapsed = id === 'parked' && !this.parkedOpen

    if (id === 'parked') {
      const toggle = laneEl.createEl('button', { cls: 'pm-email-triage-lane-toggle' })
      toggle.setAttrs({
        type: 'button',
        'aria-expanded': this.parkedOpen ? 'true' : 'false',
        'aria-controls': 'pm-email-triage-parked-rows'
      })
      const left = toggle.createDiv('pm-email-triage-lane-toggle-left')
      left.createSpan({ text: label, cls: 'pm-email-triage-lane-title' })
      left.createSpan({
        text: this.parkedOpen ? 'Hide' : 'Show',
        cls: 'pm-email-triage-lane-toggle-hint'
      })
      toggle.createSpan({ text: String(cards.length), cls: 'pm-email-triage-lane-count' })
      toggle.addEventListener('click', () => {
        this.parkedOpen = !this.parkedOpen
        this.render()
      })
      laneEl.createDiv({ text: subtitle, cls: 'pm-email-triage-lane-subtitle' })
    } else {
      const header = laneEl.createDiv('pm-email-triage-lane-header')
      header.createSpan({ text: label, cls: 'pm-email-triage-lane-title' })
      header.createSpan({ text: String(cards.length), cls: 'pm-email-triage-lane-count' })
      laneEl.createDiv({ text: subtitle, cls: 'pm-email-triage-lane-subtitle' })
    }

    if (collapsed) return

    const rows = laneEl.createDiv('pm-email-triage-lane-rows')
    if (id === 'parked') rows.id = 'pm-email-triage-parked-rows'
    if (!cards.length) {
      rows.createDiv({ text: 'None', cls: 'pm-email-triage-empty' })
      return
    }
    for (const card of cards) this.renderRow(rows, card)
  }

  private renderRow(parent: HTMLElement, card: EmailTriageCard): void {
    const el = parent.createDiv('pm-email-triage-row')
    const main = el.createDiv('pm-email-triage-row-main')

    const title = main.createDiv({ text: card.parent.title, cls: 'pm-email-triage-row-title' })
    title.setAttrs({
      role: 'button',
      tabindex: '0',
      'aria-label': `Open thread: ${card.parent.title}`,
      title: card.parent.title
    })
    title.addEventListener('click', () => this.openTask(card.parent))
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.openTask(card.parent)
      }
    })

    const next = main.createDiv({ text: card.nextAction, cls: 'pm-email-triage-row-next' })
    next.setAttr('title', card.nextAction)
    if (card.nextTask) {
      next.addClass('pm-email-triage-row-next--primary')
      next.setAttrs({
        role: 'button',
        tabindex: '0',
        'aria-label': `Open next step: ${card.nextAction}`
      })
      next.addEventListener('click', () => this.openTask(card.nextTask!))
      next.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.openTask(card.nextTask!)
        }
      })
    }

    const chips = el.createDiv('pm-email-triage-chips')
    this.renderCountChip(chips, 'request', card.openRequests.length)
    this.renderCountChip(chips, 'promise', card.openPromises.length)

    if (card.due) {
      const soon = dueWithinDays(card.due, todayIso(), 3)
      const overdue =
        dueUrgency({ ...card.parent, due: card.due }, this.scope.config.statuses) === 'overdue'
      const dateText = formatTriageDate(card.due)
      const due = el.createSpan({ text: dateText, cls: 'pm-email-triage-row-due' })
      if (overdue) {
        due.addClass('pm-email-triage-row-due--overdue')
        due.setAttr('aria-label', `Next deadline ${dateText}, overdue`)
      } else if (soon) {
        due.addClass('pm-email-triage-row-due--soon')
        due.setAttr('aria-label', `Next deadline ${dateText}, within three days`)
      }
    } else {
      el.createSpan({ text: '—', cls: 'pm-email-triage-row-due pm-email-triage-row-due--empty' })
    }

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.openContextMenu(card.parent, e)
    })
  }

  private renderCountChip(parent: HTMLElement, kind: 'request' | 'promise', count: number): void {
    if (!count) return
    parent.createSpan({
      text: `${count} ${kind}${count === 1 ? '' : 's'}`,
      cls: `pm-email-triage-chip pm-email-triage-chip--${kind}`
    })
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

function collectBodies(roots: Task[]): Task[] {
  const out: Task[] = []
  const seen = new Set<string>()
  const walk = (task: Task): void => {
    if (seen.has(task.id)) return
    seen.add(task.id)
    out.push(task)
    for (const child of task.subtasks) walk(child)
  }
  for (const root of roots) walk(root)
  return out
}
