/** Effort measure and sort weight for Matrix Flat. */

export type EffortBand = 'none' | 's' | 'm' | 'l' | 'xl'

/** Heavier-first sort key: planned estimate or time already taken, whichever is larger. */
export function effortWeight(logged: number, estimate: number): number {
  const a = Number.isFinite(logged) ? Math.max(0, logged) : 0
  const b = Number.isFinite(estimate) ? Math.max(0, estimate) : 0
  return Math.max(a, b)
}

/** Typography band from the same weight used for sort. */
export function effortBand(weight: number): EffortBand {
  const hours = Number.isFinite(weight) ? weight : 0
  if (hours <= 0) return 'none'
  if (hours < 1) return 's'
  if (hours < 3) return 'm'
  if (hours < 6) return 'l'
  return 'xl'
}

/** @deprecated Use effortBand(effortWeight(...)); kept for older call sites. */
export function loggedWashBand(logged: number): EffortBand {
  return effortBand(logged)
}

/** True when logged time has passed a positive estimate. */
export function isEffortOverrun(logged: number, estimate: number): boolean {
  return estimate > 0 && logged > estimate
}

function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10
}

/** Flat leading measure label; null when there is nothing to show. */
export function formatEffortLabel(logged: number, estimate: number): string | null {
  const L = roundHours(Number.isFinite(logged) ? Math.max(0, logged) : 0)
  const E = roundHours(Number.isFinite(estimate) ? Math.max(0, estimate) : 0)
  if (L <= 0 && E <= 0) return null
  if (E > 0) return `${L}/${E}h`
  return `${L}h`
}
