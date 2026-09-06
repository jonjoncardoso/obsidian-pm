export interface MilestonePoint {
  name: string
  dateLabel: string
  /** Where the milestone sits on the track, 0-100. */
  pos: number
  state: 'done' | 'next' | 'plan'
}

const LABEL_WIDTH = 160
const SLOT_WIDTH = 112
const MIN_WIDTH = 320
const MAX_TIERS = 6

/** Horizontal extent of a label in percentage units, accounting for alignment. */
function labelExtent(
  pos: number,
  gap: number,
  edge: 'start' | 'end' | 'center'
): [number, number] {
  if (edge === 'start') return [pos, pos + gap]
  if (edge === 'end') return [pos - gap, pos]
  return [pos - gap / 2, pos + gap / 2]
}

function extentsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

/**
 * Date-proportional milestone dots on one track, with a dashed marker for today.
 * Labels alternate below (even tiers: 0, 2) and above (odd tiers: 1, 3) the track
 * to use vertical space on both sides. Within each side, a second row is added
 * only when the first row on that side is full.
 */
export function renderMilestoneTimeline(
  parent: HTMLElement,
  points: MilestonePoint[],
  todayPos: number | null
): HTMLElement {
  const scroller = parent.createDiv('pm-timeline-scroll')
  const timeline = scroller.createDiv('pm-timeline')
  const width = Math.max(points.length * SLOT_WIDTH, MIN_WIDTH)
  timeline.style.setProperty('--pm-timeline-min-width', `${width}px`)
  timeline.createDiv('pm-timeline-track')

  if (todayPos !== null && todayPos >= 0 && todayPos <= 100) {
    const marker = timeline.createDiv('pm-timeline-today')
    marker.style.setProperty('--pm-timeline-pos', `${todayPos}%`)
    marker.createSpan({ cls: 'pm-timeline-today-label', text: 'Today' })
  }

  const gap = (LABEL_WIDTH / width) * 100

  // Each tier keeps the extents of labels placed on it.
  const tiers: [number, number][][] = []
  let maxTier = 0

  for (const point of points) {
    const edge =
      point.pos < 7 ? 'start' : point.pos > 93 ? 'end' : 'center'
    const ext = labelExtent(point.pos, gap, edge)

    // Find the lowest tier with no horizontal collision.
    let tier = 0
    while (tier < MAX_TIERS) {
      const occupied = tiers[tier]
      if (!occupied || occupied.every((e) => !extentsOverlap(ext, e))) break
      tier++
    }
    if (tier >= MAX_TIERS) tier = MAX_TIERS - 1

    if (!tiers[tier]) tiers[tier] = []
    tiers[tier].push(ext)
    if (tier > maxTier) maxTier = tier

    // Even tiers (0, 2) render below the track, odd tiers (1, 3) above.
    const above = tier % 2 === 1
    const rank = Math.floor(tier / 2) // 0 or 1 within each side

    const item = timeline.createDiv(
      `pm-timeline-item pm-timeline-item--${point.state}`
    )
    item.style.setProperty('--pm-timeline-pos', `${point.pos}%`)

    if (above) item.addClass('pm-timeline-item--above')
    if (tier > 0) item.style.setProperty('--pm-tier-rank', `${rank}`)

    if (edge === 'start') item.addClass('pm-timeline-item--start')
    else if (edge === 'end') item.addClass('pm-timeline-item--end')

    item.createDiv('pm-timeline-dot')
    const label = item.createDiv('pm-timeline-label')
    label.setAttribute('title', `${point.name}\n${point.dateLabel}`)
    label.createDiv({ cls: 'pm-timeline-name', text: point.name })
    label.createDiv({ cls: 'pm-timeline-date', text: point.dateLabel })
  }

  if (maxTier > 0) {
    timeline.addClass('pm-timeline--has-tiers')
    // Count how many rows above and below.
    const belowRows = Math.floor(maxTier / 2) + 1
    const aboveRows = Math.ceil(maxTier / 2)
    timeline.style.setProperty('--pm-tiers-below', `${belowRows}`)
    timeline.style.setProperty('--pm-tiers-above', `${aboveRows}`)
  }

  return timeline
}
