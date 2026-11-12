import type { StatusConfig, Task } from '../types'
import { isTerminalStatus } from '../utils'
import { subtreeLoggedHours, subtreeTimeEstimate } from './TaskTreeOps'

export type TriageLaneId = 'acts-now' | 'waiting-student' | 'waiting-portal' | 'parked' | 'completed'

export type StepFill = 'empty' | 'current' | 'done' | 'waiting' | 'blocked'

export interface TriagePane {
  label: string
  task: Task
  fill: StepFill
}

export interface TriageStepSquare {
  /** Outer square; when panes.length === 1 this is that task. */
  primary: Task | null
  panes: TriagePane[]
  fill: StepFill
}

export interface TriageHoursStrip {
  filled: number
  total: number
  logged: number
  estimate: number
}

export interface TriageCard {
  parent: Task
  lane: TriageLaneId
  steps: TriageStepSquare[]
  hours: TriageHoursStrip
  /** Index 0–5 of the current incomplete step square; -1 when none. */
  currentStepIndex: number
  nextAction: string
  nextTask: Task | null
  due: string
}

export const PIPELINE_SLOT_COUNT = 6

export const TRIAGE_LANES: { id: TriageLaneId; label: string }[] = [
  { id: 'acts-now', label: 'Act now' },
  { id: 'waiting-student', label: 'Waiting on student' },
  { id: 'waiting-portal', label: 'Waiting on portal' },
  { id: 'parked', label: 'Parked' },
  { id: 'completed', label: 'Completed' }
]

const STEP_ID_LINE = /^template_step_id:\s*(\S+)\s*$/m
/** `05` from `05-portal-submit`; `05` + `b` from `05b-uni-east`. */
const STEP_ID_PARTS = /^(\d{2})([a-z])?(?:-|$)/i
/** Title prefix `3. Ingest` or `5.2 Uni East`. */
const TITLE_STEP = /^(\d{1,2})(?:\.(\d+))?\b/

const COLLECT_RE = /collect/i
const PORTAL_RE = /portal|submit/i
const REPLY_RE = /reply|first.?ask/i
const DRAFT_RE = /draft/i
const INGEST_RE = /ingest/i

const HOUR_SQUARE_CAP = 8
const PARK_DAYS = 21

export function parseTemplateStepId(description: string): string | null {
  const match = description.match(STEP_ID_LINE)
  return match?.[1] ?? null
}

export function stepIdParts(stepId: string): { base: string; variant: string | null } | null {
  const match = stepId.match(STEP_ID_PARTS)
  if (!match) return null
  return { base: match[1], variant: match[2]?.toLowerCase() ?? null }
}

/** Slot 0–5 and whether this task is a letter-suffix / numbered sub-version of that slot. */
export function resolveStepPlacement(task: Task): { slot: number; isVariant: boolean } | null {
  const stepId = parseTemplateStepId(task.description)
  if (stepId) {
    const parts = stepIdParts(stepId)
    if (parts) {
      const slot = Number(parts.base) - 1
      if (slot >= 0 && slot < PIPELINE_SLOT_COUNT) {
        return { slot, isVariant: parts.variant !== null }
      }
    }
  }
  const title = task.title.match(TITLE_STEP)
  if (!title) return null
  const major = Number(title[1])
  if (major < 1 || major > PIPELINE_SLOT_COUNT) return null
  const minor = title[2] ? Number(title[2]) : 0
  return { slot: major - 1, isVariant: minor > 0 }
}

function kindOf(task: Task, stepId: string | null): 'collect' | 'portal' | 'reply' | 'draft' | 'ingest' | 'other' {
  const hay = `${stepId ?? ''} ${task.title}`
  if (COLLECT_RE.test(hay)) return 'collect'
  if (PORTAL_RE.test(hay)) return 'portal'
  if (REPLY_RE.test(hay)) return 'reply'
  if (DRAFT_RE.test(hay)) return 'draft'
  if (INGEST_RE.test(hay)) return 'ingest'
  return 'other'
}

function fillFor(task: Task, statuses: StatusConfig[], isCurrent: boolean): StepFill {
  if (task.status === 'cancelled') return 'waiting'
  if (isTerminalStatus(task.status, statuses)) return 'done'
  if (task.status === 'blocked') return 'blocked'
  if (isCurrent) return 'current'
  return 'empty'
}

function compareSteps(a: Task, b: Task): number {
  const as = a.start || '9999'
  const bs = b.start || '9999'
  if (as !== bs) return as.localeCompare(bs)
  const ad = a.due || '9999'
  const bd = b.due || '9999'
  if (ad !== bd) return ad.localeCompare(bd)
  return a.title.localeCompare(b.title)
}

function liveChildren(task: Task): Task[] {
  return task.subtasks.filter((child) => child.status !== 'cancelled')
}

function emptySquare(): TriageStepSquare {
  return { primary: null, panes: [], fill: 'empty' }
}

/**
 * Always six pipeline slots (1→6). `template_step_id` or a leading title number
 * places each direct subtask; letter / minor subversions become vertical panes
 * inside that slot. Unplaced children are ignored when any slot was keyed.
 */
export function buildStepSquares(parent: Task, statuses: StatusConfig[]): TriageStepSquare[] {
  const groups: { primary: Task | null; variants: Task[] }[] = Array.from({ length: PIPELINE_SLOT_COUNT }, () => ({
    primary: null,
    variants: []
  }))
  const unkeyed: Task[] = []
  let keyed = false

  for (const child of parent.subtasks) {
    const place = resolveStepPlacement(child)
    if (!place) {
      unkeyed.push(child)
      continue
    }
    keyed = true
    const group = groups[place.slot]
    if (place.isVariant) group.variants.push(child)
    else if (!group.primary) group.primary = child
    else group.variants.push(child)
  }

  if (keyed) {
    for (const group of groups) {
      if (group.primary) {
        for (const nested of liveChildren(group.primary)) {
          if (!group.variants.some((v) => v.id === nested.id)) group.variants.push(nested)
        }
      }
      group.variants.sort(compareProgramme)
    }
    return groups.map((group, slot) => {
      if (!group.primary && !group.variants.length) return emptySquare()
      return squareFromGroup(group.primary, group.variants, statuses, slot)
    })
  }

  const fallback = [...unkeyed]
    .sort(compareSteps)
    .slice(0, PIPELINE_SLOT_COUNT)
    .map((task, slot) => squareFromGroup(task, liveChildren(task), statuses, slot))
  while (fallback.length < PIPELINE_SLOT_COUNT) fallback.push(emptySquare())
  return fallback
}

function compareProgramme(a: Task, b: Task): number {
  const am = a.title.match(TITLE_STEP)
  const bm = b.title.match(TITLE_STEP)
  const aMinor = am?.[2] ? Number(am[2]) : 0
  const bMinor = bm?.[2] ? Number(bm[2]) : 0
  if (aMinor !== bMinor) return aMinor - bMinor
  return compareSteps(a, b)
}

function programmeLabel(task: Task, slot: number, index: number, total: number): string {
  if (total <= 1) return ''
  const titled = task.title.match(TITLE_STEP)
  if (titled?.[2]) return `${titled[1]}.${titled[2]}`
  return `${slot + 1}.${index + 1}`
}

/**
 * When a stage has nested programme cards (or letter-suffix variants), those
 * become the stacked panes. The umbrella stage task is omitted from the stack
 * so 5.1–5.5 show as five full squares, not an extra umbrella cell.
 */
function squareFromGroup(
  primary: Task | null,
  variants: Task[],
  statuses: StatusConfig[],
  slot: number
): TriageStepSquare {
  const nested = primary ? liveChildren(primary) : []
  const programmeTasks = nested.length
    ? [...nested].sort(compareProgramme)
    : variants.length
      ? [...variants].sort(compareProgramme)
      : primary
        ? [primary]
        : []

  if (!programmeTasks.length) {
    return { primary: null, panes: [], fill: 'empty' }
  }

  const currentId = nextIncompleteId(programmeTasks, statuses)
  const panes: TriagePane[] = programmeTasks.map((task, i) => ({
    label: programmeLabel(task, slot, i, programmeTasks.length),
    task,
    fill: fillFor(task, statuses, task.id === currentId)
  }))
  const fill = aggregateFill(panes.map((p) => p.fill))
  return { primary: primary ?? programmeTasks[0], panes, fill }
}

function nextIncompleteId(tasks: Task[], statuses: StatusConfig[]): string | null {
  for (const task of tasks) {
    if (task.status === 'cancelled') continue
    if (!isTerminalStatus(task.status, statuses)) return task.id
  }
  return null
}

function aggregateFill(fills: StepFill[]): StepFill {
  if (!fills.length) return 'empty'
  if (fills.every((f) => f === 'done')) return 'done'
  if (fills.some((f) => f === 'current')) return 'current'
  if (fills.some((f) => f === 'blocked') && fills.every((f) => f === 'blocked' || f === 'done' || f === 'waiting')) {
    return 'blocked'
  }
  if (fills.every((f) => f === 'waiting' || f === 'done')) return 'waiting'
  if (fills.some((f) => f === 'empty' || f === 'waiting')) return 'empty'
  return 'empty'
}

/**
 * Each slot picks its own first open task as 'current'; only the card's next step keeps that fill,
 * so later open steps read as not started (or blocked) and not as due now.
 */
function settleCurrent(steps: TriageStepSquare[], currentIndex: number): void {
  steps.forEach((step, i) => {
    if (i === currentIndex) return
    let changed = false
    for (const pane of step.panes) {
      if (pane.fill === 'current') {
        pane.fill = 'empty'
        changed = true
      }
    }
    if (changed) step.fill = aggregateFill(step.panes.map((p) => p.fill))
  })
}

/** True when due is within `days` days of today, overdue included. */
export function dueWithinDays(due: string, today: string, days: number): boolean {
  const n = daysUntil(due, today)
  return n !== null && n <= days
}

export function buildHoursStrip(parent: Task): TriageHoursStrip {
  const logged = subtreeLoggedHours(parent)
  const estimate = subtreeTimeEstimate(parent)
  const total = Math.min(HOUR_SQUARE_CAP, Math.max(1, Math.ceil(estimate > 0 ? estimate : logged > 0 ? logged : 1)))
  const filled = Math.min(total, Math.round(logged))
  return { filled, total, logged, estimate }
}

function daysUntil(due: string, today: string): number | null {
  if (!due) return null
  const a = Date.parse(`${due}T12:00:00`)
  const b = Date.parse(`${today}T12:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) / 86_400_000)
}

function nextIncompleteIndex(steps: TriageStepSquare[], statuses: StatusConfig[]): number {
  for (let i = 0; i < steps.length; i++) {
    for (const pane of steps[i].panes) {
      if (pane.task.status === 'cancelled') continue
      if (!isTerminalStatus(pane.task.status, statuses)) return i
    }
  }
  return -1
}

function nextIncompleteTask(step: TriageStepSquare | null, statuses: StatusConfig[]): Task | null {
  if (!step) return null
  for (const pane of step.panes) {
    if (pane.task.status === 'cancelled') continue
    if (!isTerminalStatus(pane.task.status, statuses)) return pane.task
  }
  return null
}

/**
 * Earliest due on an incomplete step or programme pane.
 * Falls back to the parent due when no open step has a date (unlike subtreeDue, which takes the latest).
 */
export function nextDeadline(parent: Task, steps: TriageStepSquare[], statuses: StatusConfig[]): string {
  let earliest = ''
  for (const step of steps) {
    for (const pane of step.panes) {
      if (pane.task.status === 'cancelled') continue
      if (isTerminalStatus(pane.task.status, statuses)) continue
      const due = pane.task.due
      if (!due) continue
      if (!earliest || due < earliest) earliest = due
    }
  }
  return earliest || parent.due || ''
}

export function assignLane(
  parent: Task,
  steps: TriageStepSquare[],
  statuses: StatusConfig[],
  today: string
): TriageLaneId {
  const currentIndex = nextIncompleteIndex(steps, statuses)
  const nextStep = currentIndex >= 0 ? steps[currentIndex] : null
  const nextTask = nextIncompleteTask(nextStep, statuses)
  if (!nextTask) return 'parked'

  const stepId = parseTemplateStepId(nextTask.description)
  const kind = kindOf(nextTask, stepId)
  const urgency = String(parent.customFields.urgency ?? '')
  const until = daysUntil(nextDeadline(parent, steps, statuses), today)

  if (kind === 'collect') return 'waiting-student'

  if (kind === 'portal') {
    const panes = nextStep?.panes ?? []
    const anyNearDue = panes.some((pane) => {
      const d = daysUntil(pane.task.due, today)
      return d !== null && d <= 14
    })
    if (!anyNearDue) return 'waiting-portal'
    return 'acts-now'
  }

  if (urgency === 'Low' && (until === null || until > PARK_DAYS)) return 'parked'
  if (until !== null && until > PARK_DAYS && kind === 'other') return 'parked'

  return 'acts-now'
}

/** A student card has at least one child placed in a numbered pipeline step. */
export function hasPipelineSteps(parent: Task): boolean {
  return parent.subtasks.some((child) => resolveStepPlacement(child) !== null)
}

function parentComplete(parent: Task, steps: TriageStepSquare[], statuses: StatusConfig[]): boolean {
  if (isTerminalStatus(parent.status, statuses) && parent.status !== 'cancelled') {
    if (!steps.length) return true
  }
  if (!steps.length) return isTerminalStatus(parent.status, statuses)
  return steps.every((step) => {
    if (!step.panes.length) return true
    return step.panes.every(
      (pane) => pane.task.status === 'cancelled' || isTerminalStatus(pane.task.status, statuses)
    )
  })
}

/**
 * Root parents for triage: top-level tasks that are not cancelled.
 * Finished student cards go to the Completed lane; finished cards without pipeline steps stay off the board.
 */
export function buildTriageCards(roots: Task[], statuses: StatusConfig[], today: string): TriageCard[] {
  const cards: TriageCard[] = []
  for (const parent of roots) {
    if (parent.type === 'milestone') continue
    if (parent.status === 'cancelled') continue
    const steps = buildStepSquares(parent, statuses)
    const complete = parentComplete(parent, steps, statuses)
    if (complete && !hasPipelineSteps(parent)) continue
    const currentStepIndex = complete ? -1 : nextIncompleteIndex(steps, statuses)
    const nextStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null
    const nextTask = complete ? null : nextIncompleteTask(nextStep, statuses)
    const lane: TriageLaneId = complete ? 'completed' : assignLane(parent, steps, statuses, today)
    settleCurrent(steps, currentStepIndex)
    cards.push({
      parent,
      lane,
      steps,
      hours: buildHoursStrip(parent),
      currentStepIndex,
      nextAction: complete ? 'Done' : nextTask?.title ?? parent.title,
      nextTask,
      due: complete ? '' : nextDeadline(parent, steps, statuses)
    })
  }
  return cards
}

export function groupByLane(cards: TriageCard[]): Record<TriageLaneId, TriageCard[]> {
  const groups: Record<TriageLaneId, TriageCard[]> = {
    'acts-now': [],
    'waiting-student': [],
    'waiting-portal': [],
    parked: [],
    completed: []
  }
  for (const card of cards) groups[card.lane].push(card)
  for (const lane of TRIAGE_LANES) {
    groups[lane.id].sort((a, b) => {
      const ad = a.due || '9999'
      const bd = b.due || '9999'
      if (ad !== bd) return ad.localeCompare(bd)
      return a.parent.title.localeCompare(b.parent.title)
    })
  }
  return groups
}
