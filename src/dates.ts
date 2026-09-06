import { Temporal } from 'temporal-polyfill'

export { Temporal }

/** Today as a PlainDate in the user's local timezone. */
export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO()
}

/** Parse a YYYY-MM-DD field; returns null for empty/invalid strings. */
export function parsePlainDate(s: string): Temporal.PlainDate | null {
  if (!s) return null
  try {
    return Temporal.PlainDate.from(s)
  } catch {
    return null
  }
}

/** "Jun 15, 2026", or '' when empty or invalid. */
export function formatDate(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28", or '' when empty or invalid. */
export function formatDateShort(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28, 26", or '' when empty or invalid. */
export function formatDateLong(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : ''
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'outcome'

/** Null past a week out, where a relative hint adds nothing. `from` is injectable for tests. */
export function relativeDue(iso: string, from: Temporal.PlainDate = today()): { text: string; tone: DueTone } | null {
  const due = parsePlainDate(iso)
  if (!due) return null
  const days = from.until(due, { largestUnit: 'day' }).days
  if (days < 0) return { text: `${-days}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'Today', tone: 'today' }
  if (days === 1) return { text: 'Tomorrow', tone: 'today' }
  if (days <= 6) return { text: `In ${days}d`, tone: 'soon' }
  return null
}

/** Whether a finished task landed on its due date; null unless both dates are set. */
export function completionOutcome(due: string, completed: string): { text: string; tone: DueTone } | null {
  const dueDate = parsePlainDate(due)
  const completedDate = parsePlainDate(completed)
  if (!dueDate || !completedDate) return null
  const days = dueDate.until(completedDate, { largestUnit: 'day' }).days
  return { text: days > 0 ? `${days}d late` : 'On time', tone: 'outcome' }
}

/** Structural subset of Task this needs; avoids importing types.ts, which already imports from here. */
export interface EditableTaskNode {
  updatedAt: string
  subtasks: EditableTaskNode[]
}

/** Latest updatedAt across a task and every descendant subtask, as epoch ms. */
export function taskLastEdited(task: EditableTaskNode): number {
  let latest = Date.parse(task.updatedAt)
  if (Number.isNaN(latest)) latest = 0
  for (const sub of task.subtasks) {
    const subLatest = taskLastEdited(sub)
    if (subLatest > latest) latest = subLatest
  }
  return latest
}

/** Coarse relative label for an epoch-ms timestamp (task/project lastEdited). */
export function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs
  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.round(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.round(diffMonths / 12)}y ago`
}
