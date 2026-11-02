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
  II: 'Not Urgent & Important',
  III: 'Urgent & Not Important',
  IV: 'Not Urgent & Not Important'
}

export const URGENCY_FIELD_ID = 'urgency'

export const URGENCY_FIELD_DEF = {
  id: URGENCY_FIELD_ID,
  name: 'Urgency',
  type: 'select' as const,
  options: ['High', 'Medium', 'Low']
}
