import type { PriorityConfig, StatusConfig } from '../types'
import type { TaskRef } from './VaultIndex'
import { isTerminalStatus } from '../utils'
import { effortWeight } from './sprintEffort'
import { hoursByActor, sprintMembership } from './sprintTags'
import type { SprintColumnModel, SprintProjectNode, SprintTaskDetails, SprintTaskNode } from './sprintBoard'

/** Roots for Matrix Flat: keep parent/child trees; do not flatten leaves. */
export function collectFlatSprintRoots(model: SprintColumnModel): SprintTaskNode[] {
  const out: SprintTaskNode[] = []
  const walkProject = (node: SprintProjectNode): void => {
    for (const task of node.tasks) out.push(task)
    for (const child of node.children) walkProject(child)
  }
  for (const project of model.projects) walkProject(project)
  return out
}

/** Visit every card row that draws in Flat (skip groupingOnly headers). */
function visitFlatPieces(node: SprintTaskNode, visit: (piece: SprintTaskNode) => void): void {
  if (!node.groupingOnly) visit(node)
  for (const child of node.children) visitFlatPieces(child, visit)
}

/** Group is terminal only when every visible piece is terminal. */
export function flatGroupIsTerminal(node: SprintTaskNode, statuses: StatusConfig[]): boolean {
  let sawPiece = false
  let allTerminal = true
  visitFlatPieces(node, (piece) => {
    sawPiece = true
    if (!isTerminalStatus(piece.ref.status, statuses)) allTerminal = false
  })
  if (!sawPiece) return isTerminalStatus(node.ref.status, statuses)
  return allTerminal
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}

/** Own logged/estimate for a card (no child rollup). */
export function flatOwnEffort(
  ref: TaskRef,
  details: Map<string, SprintTaskDetails>
): { logged: number; estimate: number } {
  const row = details.get(ref.id)
  const hours = row ? hoursByActor(row.timeLogs) : { agent: 0, jon: 0 }
  const logged = roundHours(hours.agent + hours.jon)
  const estimate =
    row && row.timeEstimate !== undefined
      ? row.timeEstimate
      : Number.isFinite(ref.timeEstimate)
        ? (ref.timeEstimate as number)
        : 0
  return { logged, estimate: roundHours(Math.max(0, estimate)) }
}

/**
 * Effort on a Flat row. Flat draws roots only (children stay nested inside the
 * node for hours/sort), so parents use the quadrant-local rollup on the node.
 */
export function flatRowEffort(
  node: SprintTaskNode,
  _details: Map<string, SprintTaskDetails>
): { logged: number; estimate: number } {
  return { logged: node.logged, estimate: node.estimate }
}

/** How many real cards sit under this Flat root (direct and deeper). */
export function flatNestedCardCount(node: SprintTaskNode): number {
  let count = 0
  const walk = (child: SprintTaskNode): void => {
    if (!child.groupingOnly) count += 1
    for (const next of child.children) walk(next)
  }
  for (const child of node.children) walk(child)
  return count
}

function attentionRank(status: string): number {
  switch (status) {
    case 'in-progress':
      return 0
    case 'blocked':
      return 1
    case 'review':
      return 2
    case 'todo':
      return 3
    default:
      return 4
  }
}

function priorityRank(priority: string, priorities: PriorityConfig[]): number {
  const idx = priorities.findIndex((cfg) => cfg.id === priority)
  return idx >= 0 ? idx : 999
}

/**
 * Flat group order: open groups above Done; among open, heavier group effort
 * first, then attention → due → priority → This week before Next; among
 * terminal, newest completed first.
 */
export function compareFlatSprintGroups(
  a: SprintTaskNode,
  b: SprintTaskNode,
  statuses: StatusConfig[],
  priorities: PriorityConfig[]
): number {
  const aTerm = flatGroupIsTerminal(a, statuses)
  const bTerm = flatGroupIsTerminal(b, statuses)
  if (aTerm !== bTerm) return aTerm ? 1 : -1

  if (!aTerm) {
    const byEffort = effortWeight(b.logged, b.estimate) - effortWeight(a.logged, a.estimate)
    if (byEffort !== 0) return byEffort

    const byAttention = attentionRank(a.ref.status) - attentionRank(b.ref.status)
    if (byAttention !== 0) return byAttention

    const aDue = a.ref.due || '9999-99-99'
    const bDue = b.ref.due || '9999-99-99'
    if (aDue !== bDue) return aDue.localeCompare(bDue)

    const byPriority = priorityRank(a.ref.priority, priorities) - priorityRank(b.ref.priority, priorities)
    if (byPriority !== 0) return byPriority

    const aLane = sprintMembership(a.ref.tags) === 'next' ? 1 : 0
    const bLane = sprintMembership(b.ref.tags) === 'next' ? 1 : 0
    if (aLane !== bLane) return aLane - bLane
  } else {
    const aDone = a.ref.completed || ''
    const bDone = b.ref.completed || ''
    if (aDone !== bDone) return bDone.localeCompare(aDone)
  }

  return a.ref.title.localeCompare(b.ref.title)
}

/** Collect and sort Flat roots for one sprint column. */
export function sortedFlatSprintRoots(
  model: SprintColumnModel,
  statuses: StatusConfig[],
  priorities: PriorityConfig[]
): SprintTaskNode[] {
  const roots = collectFlatSprintRoots(model)
  roots.sort((a, b) => compareFlatSprintGroups(a, b, statuses, priorities))
  return roots
}
