import type { StatusConfig, Task } from '../types'
import { isTerminalStatus } from '../utils'
import { dueWithinDays, parseTemplateStepId } from './attentionTriage'

export type EmailLaneId = 'acts-now' | 'deliver' | 'waiting' | 'parked'

export type EmailItemKind = 'request' | 'promise' | 'waiting'

export interface EmailTriageCard {
  parent: Task
  lane: EmailLaneId
  openRequests: Task[]
  openPromises: Task[]
  nextAction: string
  nextTask: Task | null
  due: string
}

export const EMAIL_TRIAGE_LANES: { id: EmailLaneId; label: string; subtitle: string }[] = [
  { id: 'acts-now', label: 'Act now', subtitle: 'Reply owed' },
  { id: 'deliver', label: 'Deliver', subtitle: 'You promised' },
  { id: 'waiting', label: 'Waiting', subtitle: 'Blocked or waiting on others' },
  { id: 'parked', label: 'Parked', subtitle: 'No open items' }
]

const PARENT_LINE = /^Parent:\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/m
const NEXT_STEP_BOLD = /\*\*Next step:\s*(.+?)\*\*/i
const NEXT_STEP_PLAIN = /^Next step:\s*(.+)$/im
const WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/

/** Target path or id inside `[[target|label]]`, or the raw string. */
export function wikilinkTarget(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(WIKILINK)
  return match ? match[1].trim() : trimmed
}

export function parseParentRef(description: string): string | null {
  const match = description.match(PARENT_LINE)
  return match ? match[1].trim() : null
}

export function parseNextStep(description: string): string | null {
  const bold = description.match(NEXT_STEP_BOLD)
  if (bold?.[1]) return bold[1].trim()
  const plain = description.match(NEXT_STEP_PLAIN)
  return plain?.[1]?.trim() ?? null
}

export function itemKind(task: Task): EmailItemKind | null {
  const stepId = parseTemplateStepId(task.description)
  if (stepId === 'request' || stepId === 'promise' || stepId === 'waiting') return stepId
  const title = task.title.toLowerCase()
  if (title.startsWith('request')) return 'request'
  if (title.startsWith('promise')) return 'promise'
  if (title.startsWith('waiting')) return 'waiting'
  return null
}

export function isMailParent(task: Task): boolean {
  if (/##\s*Mail index/i.test(task.description)) return true
  if (itemKind(task)) return false
  return task.type !== 'subtask'
}

export function flattenTaskPool(roots: Task[]): Task[] {
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

/**
 * Resolve a Parent: / parentId wikilink against the pool.
 * Frontmatter often stores a truncated id (`codio-demo-session`); body uses the full id.
 */
export function resolveTaskRef(ref: string, byId: Map<string, Task>): Task | null {
  const target = wikilinkTarget(ref)
  const exact = byId.get(target)
  if (exact) return exact
  let prefixHit: Task | null = null
  for (const task of byId.values()) {
    if (task.id === target || task.id.startsWith(`${target}-`)) {
      if (prefixHit && prefixHit.id !== task.id) return null
      prefixHit = task
    }
  }
  return prefixHit
}

function isOpenItem(task: Task, statuses: StatusConfig[]): boolean {
  if (task.status === 'cancelled') return false
  return !isTerminalStatus(task.status, statuses)
}

function compareDueThenTitle(a: Task, b: Task): number {
  const ad = a.due || '9999'
  const bd = b.due || '9999'
  if (ad !== bd) return ad.localeCompare(bd)
  return a.title.localeCompare(b.title)
}

function nextDeadlineAmong(items: Task[]): string {
  let earliest = ''
  for (const item of items) {
    if (!item.due) continue
    if (!earliest || item.due < earliest) earliest = item.due
  }
  return earliest
}

function nextStepLabel(task: Task): string {
  return parseNextStep(task.description) ?? task.title
}

/**
 * Group request/promise (and future waiting) items under mail parents.
 * Flat project roots with broken wikilink parentId still join via the body Parent: line.
 */
export function groupEmailThreads(
  roots: Task[],
  statuses: StatusConfig[]
): { parents: Task[]; childrenByParent: Map<string, Task[]> } {
  const pool = flattenTaskPool(roots)
  const byId = new Map(pool.map((task) => [task.id, task]))
  const childrenByParent = new Map<string, Task[]>()
  const claimed = new Set<string>()

  for (const task of pool) {
    const kind = itemKind(task)
    if (!kind) continue
    const ref = parseParentRef(task.description)
    if (!ref) continue
    const parent = resolveTaskRef(ref, byId)
    if (!parent) continue
    const list = childrenByParent.get(parent.id) ?? []
    list.push(task)
    childrenByParent.set(parent.id, list)
    claimed.add(task.id)
  }

  for (const parent of pool) {
    if (!isMailParent(parent) && !childrenByParent.has(parent.id)) continue
    for (const child of parent.subtasks) {
      if (claimed.has(child.id)) continue
      if (!itemKind(child)) continue
      const list = childrenByParent.get(parent.id) ?? []
      list.push(child)
      childrenByParent.set(parent.id, list)
      claimed.add(child.id)
    }
  }

  const parents: Task[] = []
  const seenParent = new Set<string>()
  for (const task of pool) {
    if (claimed.has(task.id)) continue
    if (!isMailParent(task) && !childrenByParent.has(task.id)) continue
    if (task.status === 'cancelled') continue
    if (seenParent.has(task.id)) continue
    seenParent.add(task.id)
    parents.push(task)
  }

  for (const list of childrenByParent.values()) list.sort(compareDueThenTitle)
  return { parents, childrenByParent }
}

export function assignEmailLane(
  parent: Task,
  openRequests: Task[],
  openPromises: Task[],
  statuses: StatusConfig[]
): EmailLaneId {
  if (parent.status === 'blocked') return 'waiting'
  if (openRequests.length) return 'acts-now'
  if (openPromises.length) return 'deliver'
  void statuses
  return 'parked'
}

export function buildEmailTriageCards(roots: Task[], statuses: StatusConfig[]): EmailTriageCard[] {
  const { parents, childrenByParent } = groupEmailThreads(roots, statuses)
  const cards: EmailTriageCard[] = []

  for (const parent of parents) {
    if (parent.type === 'milestone') continue
    const children = childrenByParent.get(parent.id) ?? []
    const openRequests = children.filter((c) => itemKind(c) === 'request' && isOpenItem(c, statuses))
    const openPromises = children.filter((c) => itemKind(c) === 'promise' && isOpenItem(c, statuses))
    const openWaiting = children.filter((c) => itemKind(c) === 'waiting' && isOpenItem(c, statuses))

    const allOpen = [...openRequests, ...openPromises, ...openWaiting]
    if (
      isTerminalStatus(parent.status, statuses) &&
      parent.status !== 'cancelled' &&
      !allOpen.length
    ) {
      continue
    }

    const nextTask = openRequests[0] ?? openPromises[0] ?? openWaiting[0] ?? null
    const lane =
      openWaiting.length && !openRequests.length && !openPromises.length
        ? 'waiting'
        : assignEmailLane(parent, openRequests, openPromises, statuses)

    cards.push({
      parent,
      lane,
      openRequests,
      openPromises,
      nextAction: nextTask ? nextStepLabel(nextTask) : parent.title,
      nextTask,
      due: nextDeadlineAmong(allOpen) || parent.due || ''
    })
  }

  return cards
}

export function groupEmailByLane(cards: EmailTriageCard[]): Record<EmailLaneId, EmailTriageCard[]> {
  const groups: Record<EmailLaneId, EmailTriageCard[]> = {
    'acts-now': [],
    deliver: [],
    waiting: [],
    parked: []
  }
  for (const card of cards) groups[card.lane].push(card)
  for (const lane of EMAIL_TRIAGE_LANES) {
    groups[lane.id].sort((a, b) => {
      const ad = a.due || '9999'
      const bd = b.due || '9999'
      if (ad !== bd) return ad.localeCompare(bd)
      return a.parent.title.localeCompare(b.parent.title)
    })
  }
  return groups
}

export { dueWithinDays }
