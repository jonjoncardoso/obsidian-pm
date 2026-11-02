/** Eisenhower quadrant codes matching the Digital Life Hub Tasks sheet. */
export type EisenhowerQuadrant = 'I' | 'II' | 'III' | 'IV'

/**
 * Importance axis from `priority:`.
 * Critical and high both count as High (sheet Importance = High).
 */
export function importanceRank(priority: string): 'high' | 'other' {
  const id = priority.trim().toLowerCase()
  if (id === 'high' || id === 'critical') return 'high'
  return 'other'
}

/**
 * Derive I–IV from priority (Importance) and urgency, matching the Tasks sheet formula:
 *
 *   IF Importance empty → blank
 *   ELSE IF Importance = High → (Urgency = High ? I : II)
 *   ELSE → (Urgency in High,Medium ? III : IV)
 *
 * Blank gate here is missing Urgency (priority always defaults on new cards).
 */
export function deriveEisenhowerQuadrant(
  priority: string,
  urgency: string | undefined
): EisenhowerQuadrant | null {
  const urg = (urgency ?? '').trim()
  if (!urg) return null

  const urgNorm = urg.toLowerCase()
  const urgHigh = urgNorm === 'high'
  const urgMedium = urgNorm === 'medium'

  if (importanceRank(priority) === 'high') {
    return urgHigh ? 'I' : 'II'
  }
  return urgHigh || urgMedium ? 'III' : 'IV'
}

export const EISENHOWER_QUADRANT_LABELS: Record<EisenhowerQuadrant, string> = {
  I: 'Urgent & Important',
  II: 'Not Urgent but Important',
  III: 'Urgent but Not Important',
  IV: 'Not Urgent and Not Important'
}

export const URGENCY_FIELD_ID = 'urgency'

export const URGENCY_FIELD_DEF = {
  id: URGENCY_FIELD_ID,
  name: 'Urgency',
  type: 'select' as const,
  options: ['High', 'Medium', 'Low']
}

/** Hover copy for Priority (Importance) options in the card editor. Keys are priority ids. */
export const IMPORTANCE_LEVEL_TOOLTIPS: Record<string, string> = {
  critical: 'Central to a commitment Jon means to keep in his own work. If this fails, that commitment fails.',
  high: "Clearly advances a current goal of Jon's. Missing a slice sets the goal back, and he can still finish it.",
  medium:
    'Worth finishing. The goal does not depend on this item alone. Ordinary admin and reference letters belong here unless Jon has made them central to a commitment he means to keep.',
  low: "Optional relative to Jon's goals. Safe to park for weeks."
}

/** Hover copy for Urgency select options. Keys match stored option labels. */
export const URGENCY_LEVEL_TOOLTIPS: Record<string, string> = {
  High: 'Delay this week costs something: hard due, person waiting, blocker, or closing window.',
  Medium: 'Should move soon. A short slip is fine.',
  Low: 'Waiting creates no near-term cost.'
}
