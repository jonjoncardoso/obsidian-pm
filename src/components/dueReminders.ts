import { Temporal, parsePlainDate } from '../dates'

export const TOAST_CAP = 5
export const TOAST_DEBOUNCE_MS = 400

export type DueKind = 'overdue' | 'today' | 'soon'

export interface DueReminder {
  taskId: string
  taskPath: string
  title: string
  due: string
  projectTitle: string
  projectPath: string
  icon: string
  color: string
  kind: DueKind
  muteKey: string
  dueLine: string
}

export interface CollectDueTask {
  id: string
  path: string
  title: string
  due: string
  status: string
  archived: boolean
}

export interface CollectDueProject {
  projectPath: string
  projectTitle: string
  icon: string
  color: string
  complete: ReadonlySet<string>
  tasks: readonly CollectDueTask[]
}

export function reminderMuteKey(taskId: string, due: string): string {
  return `${taskId}:${due}`
}

export function pruneNotificationMutes(
  mutes: Record<string, string>,
  todayIso: string
): { next: Record<string, string>; changed: boolean } {
  const next: Record<string, string> = {}
  let changed = false
  for (const [key, date] of Object.entries(mutes)) {
    if (date === todayIso) next[key] = date
    else changed = true
  }
  if (Object.keys(next).length !== Object.keys(mutes).length) changed = true
  return { next, changed }
}

function dueLineFor(kind: DueKind, due: Temporal.PlainDate, now: Temporal.PlainDate): string {
  const days = now.until(due, { largestUnit: 'day' }).days
  if (kind === 'overdue') return `${-days}d overdue`
  if (kind === 'today') return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days}d`
}

/** Open, unarchived tasks that are overdue or due within the lead window, minus today's mutes. */
export function collectDueReminders(
  projects: readonly CollectDueProject[],
  opts: {
    leadDays: number
    mutes: Record<string, string>
    now: Temporal.PlainDate
  }
): DueReminder[] {
  const todayIso = opts.now.toString()
  const threshold = opts.now.add({ days: opts.leadDays })
  const reminders: DueReminder[] = []

  for (const project of projects) {
    for (const task of project.tasks) {
      const due = parsePlainDate(task.due)
      if (!due) continue
      if (task.archived || project.complete.has(task.status)) continue

      const cmpToToday = Temporal.PlainDate.compare(due, opts.now)
      const isOverdue = cmpToToday < 0
      const isDueSoon = cmpToToday >= 0 && Temporal.PlainDate.compare(due, threshold) <= 0
      if (!isOverdue && !isDueSoon) continue

      const muteKey = reminderMuteKey(task.id, task.due)
      if (opts.mutes[muteKey] === todayIso) continue

      const kind: DueKind = isOverdue ? 'overdue' : cmpToToday === 0 ? 'today' : 'soon'
      reminders.push({
        taskId: task.id,
        taskPath: task.path,
        title: task.title,
        due: task.due,
        projectTitle: project.projectTitle,
        projectPath: project.projectPath,
        icon: project.icon,
        color: project.color,
        kind,
        muteKey,
        dueLine: dueLineFor(kind, due, opts.now)
      })
    }
  }

  reminders.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  return reminders
}

/** Newest-on-top native stack: reverse so the earliest due lands at the top. */
export function toastBurst(
  reminders: readonly DueReminder[],
  notified: ReadonlySet<string>,
  cap = TOAST_CAP
): DueReminder[] {
  return reminders
    .filter((reminder) => !notified.has(reminder.muteKey))
    .slice(0, cap)
    .reverse()
}
