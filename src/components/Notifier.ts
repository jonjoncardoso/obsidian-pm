import { Notice, setIcon } from 'obsidian'
import type PMPlugin from '../main'
import { today } from '../dates'
import { openTaskByPath } from '../ui/ModalFactory'
import { renderGlyph } from '../ui/composites/properties/optionList'
import { Popover } from '../ui/primitives/Popover'
import { safeAsync } from '../utils'
import {
  TOAST_DEBOUNCE_MS,
  collectDueReminders,
  pruneNotificationMutes,
  toastBurst,
  type CollectDueProject,
  type DueReminder
} from './dueReminders'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export {
  TOAST_CAP,
  TOAST_DEBOUNCE_MS,
  collectDueReminders,
  pruneNotificationMutes,
  reminderMuteKey,
  toastBurst
} from './dueReminders'
export type { CollectDueProject, CollectDueTask, DueKind, DueReminder } from './dueReminders'

export class Notifier {
  private intervalId: number | null = null
  private toastTimer: number | null = null
  private notifiedIds = new Set<string>()
  private inbox: DueReminder[] = []
  private statusBar: HTMLElement | null = null
  private popover: Popover | null = null

  constructor(private plugin: PMPlugin) {}

  attachStatusBar(el: HTMLElement): void {
    this.statusBar = el
    el.addClass('pm-notice-dock')
    el.addClass('mod-clickable')
    el.setAttribute('role', 'button')
    el.addEventListener('click', () => this.toggleDock())
    this.renderStatusBar()
  }

  /** The first sweep runs once the index is built; this only schedules the later ones. */
  start(): void {
    this.intervalId = window.setInterval(() => {
      this.check()
    }, CHECK_INTERVAL_MS)
    this.plugin.registerInterval(this.intervalId)
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer)
      this.toastTimer = null
    }
    this.closeDock()
  }

  /** Reads due dates from the index, so an hourly sweep loads nothing. */
  check(): void {
    if (!this.plugin.settings.notificationsEnabled) {
      this.inbox = []
      this.renderStatusBar()
      this.closeDock()
      return
    }

    this.pruneMutes()
    this.inbox = this.collectFromIndex()
    this.renderStatusBar()
    if (this.popover) this.renderDock()
    this.scheduleToasts()
  }

  private collectFromIndex(): DueReminder[] {
    const projects: CollectDueProject[] = []
    for (const project of this.plugin.index.projectRefs()) {
      projects.push({
        projectPath: project.path,
        projectTitle: project.title,
        icon: project.icon,
        color: project.color,
        complete: this.plugin.index.completeStatuses(project),
        tasks: this.plugin.index.taskRefs(project.path)
      })
    }
    return collectDueReminders(projects, {
      leadDays: this.plugin.settings.notificationLeadDays,
      mutes: this.plugin.settings.notificationMutes ?? {},
      now: today()
    })
  }

  private pruneMutes(): void {
    const { next, changed } = pruneNotificationMutes(
      this.plugin.settings.notificationMutes ?? {},
      today().toString()
    )
    if (!changed) return
    this.plugin.settings.notificationMutes = next
    void this.plugin.saveSettings()
  }

  private scheduleToasts(): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null
      this.fireToasts()
    }, TOAST_DEBOUNCE_MS)
  }

  private fireToasts(): void {
    const burst = toastBurst(this.inbox, this.notifiedIds)
    for (const reminder of burst) {
      this.notifiedIds.add(reminder.muteKey)
      this.showToast(reminder)
    }
  }

  private showToast(reminder: DueReminder): void {
    const notice = new Notice('', reminder.kind === 'overdue' ? 8000 : 6000)
    notice.noticeEl.empty()
    notice.noticeEl.addClass('pm-due-notice')
    if (reminder.kind === 'overdue') notice.noticeEl.addClass('pm-due-notice--overdue')
    renderGlyph(notice.noticeEl, { icon: reminder.icon, color: reminder.color })
    const copy = notice.noticeEl.createDiv({ cls: 'pm-due-notice-copy' })
    copy.createDiv({ cls: 'pm-due-notice-title', text: reminder.title })
    copy.createDiv({ cls: 'pm-due-notice-due', text: reminder.dueLine })
    notice.noticeEl.addEventListener('click', () => {
      notice.hide()
      void openTaskByPath(this.plugin, reminder.taskPath)
    })
  }

  private renderStatusBar(): void {
    const el = this.statusBar
    if (!el) return
    el.empty()
    if (!this.plugin.settings.notificationsEnabled || this.inbox.length === 0) {
      el.hide()
      this.closeDock()
      return
    }
    el.show()
    const icon = el.createSpan({ cls: 'pm-notice-dock-icon' })
    setIcon(icon, 'bell')
    el.createSpan({ cls: 'pm-notice-dock-count', text: String(this.inbox.length) })
    el.setAttribute('aria-label', `${this.inbox.length} due date reminders`)
  }

  private toggleDock(): void {
    if (this.popover?.isOpen) {
      this.closeDock()
      return
    }
    this.openDock()
  }

  private openDock(): void {
    if (!this.statusBar || this.inbox.length === 0) return
    this.popover = new Popover({
      anchor: this.statusBar,
      align: 'right',
      width: 320,
      onClose: () => {
        this.popover = null
      }
    })
    this.renderDock()
    this.popover.open()
  }

  private closeDock(): void {
    this.popover?.close()
    this.popover = null
  }

  private renderDock(): void {
    const pop = this.popover
    if (!pop) return
    pop.contentEl.empty()
    if (this.inbox.length === 0) {
      this.closeDock()
      return
    }
    pop.contentEl.createDiv({ cls: 'pm-pop-heading', text: 'Due reminders' })
    const list = pop.contentEl.createDiv({ cls: 'pm-pop-list' })
    for (const reminder of this.inbox) {
      const row = list.createDiv({ cls: 'pm-notice-dock-row' })
      const item = row.createEl('button', { cls: 'pm-pop-item' })
      renderGlyph(item, { icon: reminder.icon, color: reminder.color })
      const label = item.createSpan({ cls: 'pm-pop-item-label' })
      label.createSpan({ cls: 'pm-notice-dock-title', text: reminder.title })
      item.createSpan({ cls: 'pm-notice-dock-due', text: reminder.dueLine })
      item.addEventListener(
        'click',
        safeAsync(async () => {
          this.closeDock()
          await openTaskByPath(this.plugin, reminder.taskPath)
        })
      )
      const dismiss = row.createEl('button', {
        cls: 'pm-notice-dock-dismiss',
        attr: { 'aria-label': 'Dismiss until tomorrow', type: 'button' }
      })
      setIcon(dismiss, 'x')
      dismiss.addEventListener(
        'click',
        safeAsync(async (e) => {
          e.stopPropagation()
          await this.dismiss(reminder)
        })
      )
    }
  }

  private async dismiss(reminder: DueReminder): Promise<void> {
    if (!this.plugin.settings.notificationMutes) this.plugin.settings.notificationMutes = {}
    this.plugin.settings.notificationMutes[reminder.muteKey] = today().toString()
    this.notifiedIds.add(reminder.muteKey)
    await this.plugin.saveSettings()
    this.inbox = this.inbox.filter((entry) => entry.muteKey !== reminder.muteKey)
    this.renderStatusBar()
    if (this.popover) this.renderDock()
  }
}
