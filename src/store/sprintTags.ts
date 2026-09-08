import type { TimeLog } from '../types'

export const TAG_SPRINT_CURRENT = 'week-sprint'
export const TAG_SPRINT_NEXT = 'next-sprint'

export type SprintLane = 'current' | 'next'

const LIVE_TAGS = [TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT] as const

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
