import type { TimeLog } from '../types'
import type { Temporal } from '../dates'

export const TAG_SPRINT_CURRENT = 'week-sprint'
export const TAG_SPRINT_NEXT = 'next-sprint'

export type SprintLane = 'current' | 'next'

const LIVE_TAGS = [TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT] as const
const PAST_SPRINT_RE = /^sprint-(\d{4})-W(\d{2})$/

function tagFor(lane: SprintLane): string {
  return lane === 'current' ? TAG_SPRINT_CURRENT : TAG_SPRINT_NEXT
}

export function sprintMembership(tags: string[]): SprintLane | null {
  if (tags.includes(TAG_SPRINT_CURRENT)) return 'current'
  if (tags.includes(TAG_SPRINT_NEXT)) return 'next'
  return null
}

/** Add one live sprint tag and strip the other. `null` removes both. Other tags stay. */
export function applySprintTag(tags: string[], lane: SprintLane | null): string[] {
  const kept = tags.filter((tag) => !LIVE_TAGS.includes(tag as (typeof LIVE_TAGS)[number]))
  if (lane === null) return kept
  const next = tagFor(lane)
  if (kept.includes(next)) return kept
  return [...kept, next]
}

export function toggleSprintTag(tags: string[], lane: SprintLane): string[] {
  return applySprintTag(tags, sprintMembership(tags) === lane ? null : lane)
}

export function pastSprintTag(date: Temporal.PlainDate): string {
  const week = date.weekOfYear ?? 0
  const year = date.yearOfWeek ?? date.year
  return `sprint-${year}-W${String(week).padStart(2, '0')}`
}

export function parsePastSprintTag(tag: string): { year: number; week: number } | null {
  const match = PAST_SPRINT_RE.exec(tag)
  if (!match) return null
  return { year: Number(match[1]), week: Number(match[2]) }
}

export function isPastSprintTag(tag: string): boolean {
  return parsePastSprintTag(tag) !== null
}

/** Latest ISO week first. */
export function comparePastSprintTags(a: string, b: string): number {
  const left = parsePastSprintTag(a)
  const right = parsePastSprintTag(b)
  if (!left || !right) return b.localeCompare(a)
  if (left.year !== right.year) return right.year - left.year
  return right.week - left.week
}

export function retagCurrentToPast(tags: string[], pastTag: string): string[] {
  const kept = tags.filter((tag) => tag !== TAG_SPRINT_CURRENT)
  if (kept.includes(pastTag)) return kept
  return [...kept, pastTag]
}

export function hoursByActor(logs: TimeLog[]): { agent: number; jon: number } {
  let agent = 0
  let jon = 0
  for (const log of logs) {
    const hours = typeof log.hours === 'number' && Number.isFinite(log.hours) ? log.hours : 0
    if (/^agent:\s/i.test(log.note ?? '')) agent += hours
    else jon += hours
  }
  return { agent, jon }
}
