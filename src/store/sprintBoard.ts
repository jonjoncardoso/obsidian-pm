import type { StatusConfig, TimeLog } from '../types'
import type { ProjectRef, TaskRef, VaultIndex } from './VaultIndex'
import { isTerminalStatus } from '../utils'
import { deriveEisenhowerQuadrant, type EisenhowerQuadrant, URGENCY_FIELD_ID } from './eisenhower'
import { hoursByActor, isPastSprintTag, comparePastSprintTags, type SprintLane, TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT } from './sprintTags'

export interface SprintTaskDetails {
  timeLogs: TimeLog[]
  timeEstimate: number | undefined
  urgency: string | undefined
}

export function detailsFromFrontmatter(frontmatter: Record<string, unknown> | undefined): SprintTaskDetails {
  if (!frontmatter) return { timeLogs: [], timeEstimate: undefined, urgency: undefined }
  const raw = frontmatter.timeLogs
  const timeLogs: TimeLog[] = []
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const rec = row as { date?: unknown; hours?: unknown; note?: unknown }
      timeLogs.push({
        date: typeof rec.date === 'string' ? rec.date : '',
        hours: typeof rec.hours === 'number' && Number.isFinite(rec.hours) ? rec.hours : 0,
        note: typeof rec.note === 'string' ? rec.note : ''
      })
    }
  }
  const estimate = frontmatter.timeEstimate
  const custom = frontmatter.customFields
  let urgency: string | undefined
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    const value = (custom as Record<string, unknown>)[URGENCY_FIELD_ID]
    if (typeof value === 'string' && value.trim()) urgency = value.trim()
  }
  return {
    timeLogs,
    timeEstimate: typeof estimate === 'number' && Number.isFinite(estimate) ? estimate : undefined,
    urgency
  }
}

export interface ActorHours {
  agent: number
  jon: number
}

export interface SprintTaskNode {
  ref: TaskRef
  groupingOnly: boolean
  children: SprintTaskNode[]
  hours: ActorHours
  logged: number
  estimate: number
}

export interface SprintProjectNode {
  ref: ProjectRef
  children: SprintProjectNode[]
  tasks: SprintTaskNode[]
  hours: ActorHours
  logged: number
  estimate: number
}

export interface SprintColumnModel {
  lane: SprintLane | 'past' | 'matrix'
  tag: string
  cardCount: number
  hours: ActorHours
  logged: number
  estimate: number
  projects: SprintProjectNode[]
}

export interface EisenhowerMatrixModel {
  quadrants: Record<EisenhowerQuadrant, SprintColumnModel>
  unsorted: SprintColumnModel
}

export function tagForLane(lane: SprintLane): string {
  return lane === 'current' ? TAG_SPRINT_CURRENT : TAG_SPRINT_NEXT
}

export function sprintMembersForTag(index: VaultIndex, tag: string): TaskRef[] {
  return index.allTaskRefs().filter((ref) => !ref.archived && ref.tags.includes(tag))
}

export function sprintMembers(index: VaultIndex, lane: SprintLane): TaskRef[] {
  return sprintMembersForTag(index, tagForLane(lane))
}

export function listPastSprintTags(index: VaultIndex): string[] {
  const found = new Set<string>()
  for (const ref of index.allTaskRefs()) {
    if (ref.archived) continue
    for (const tag of ref.tags) {
      if (isPastSprintTag(tag)) found.add(tag)
    }
  }
  return [...found].sort(comparePastSprintTags)
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}

function addHours(a: ActorHours, b: ActorHours): ActorHours {
  return { agent: a.agent + b.agent, jon: a.jon + b.jon }
}

function ownHours(ref: TaskRef, details: Map<string, SprintTaskDetails>): ActorHours {
  const row = details.get(ref.id)
  if (row) return hoursByActor(row.timeLogs)
  return { agent: 0, jon: 0 }
}

function ownEstimate(ref: TaskRef, details: Map<string, SprintTaskDetails>): number {
  const row = details.get(ref.id)
  if (row && row.timeEstimate !== undefined) return row.timeEstimate
  return ref.timeEstimate ?? 0
}

function memberChildRefs(parentId: string, members: TaskRef[]): TaskRef[] {
  return members.filter((ref) => ref.parentId === parentId)
}

function estimateForMember(
  ref: TaskRef,
  members: TaskRef[],
  details: Map<string, SprintTaskDetails>
): number {
  const children = memberChildRefs(ref.id, members)
  if (children.length === 0) return ownEstimate(ref, details)
  let childSum = 0
  let anyChild = false
  for (const child of children) {
    const estimate = estimateForMember(child, members, details)
    if (estimate > 0) anyChild = true
    childSum += estimate
  }
  return anyChild ? childSum : ownEstimate(ref, details)
}

function buildTaskNode(
  ref: TaskRef,
  members: TaskRef[],
  details: Map<string, SprintTaskDetails>,
  groupingOnly: boolean
): SprintTaskNode {
  const children = groupingOnly
    ? []
    : memberChildRefs(ref.id, members).map((child) => buildTaskNode(child, members, details, false))
  const hours = groupingOnly
    ? { agent: 0, jon: 0 }
    : children.reduce((sum, child) => addHours(sum, child.hours), ownHours(ref, details))
  const logged = groupingOnly ? 0 : roundHours(hours.agent + hours.jon)
  const estimate = groupingOnly ? 0 : roundHours(estimateForMember(ref, members, details))
  return {
    ref,
    groupingOnly,
    children,
    hours: { agent: roundHours(hours.agent), jon: roundHours(hours.jon) },
    logged,
    estimate
  }
}

function rootTaskNodes(projectPath: string, members: TaskRef[], index: VaultIndex, details: Map<string, SprintTaskDetails>): SprintTaskNode[] {
  const here = members.filter((ref) => ref.projectPath === projectPath)
  const memberIds = new Set(here.map((ref) => ref.id))
  const grouped = new Map<string, TaskRef[]>()
  const roots: TaskRef[] = []

  for (const ref of here) {
    const parentIsMember = Boolean(ref.parentId && memberIds.has(ref.parentId))
    if (parentIsMember) continue
    const parent = ref.parentId ? index.task(ref.parentId) : null
    if (parent && !memberIds.has(parent.id) && parent.projectPath === projectPath) {
      const bucket = grouped.get(parent.id) ?? []
      bucket.push(ref)
      grouped.set(parent.id, bucket)
    } else {
      roots.push(ref)
    }
  }

  const nodes: SprintTaskNode[] = []
  for (const [parentId, children] of grouped) {
    const parent = index.task(parentId)
    if (!parent) continue
    const childNodes = children.map((child) => buildTaskNode(child, members, details, false))
    const hours = childNodes.reduce((sum, child) => addHours(sum, child.hours), { agent: 0, jon: 0 })
    const estimate = childNodes.reduce((sum, child) => sum + child.estimate, 0)
    nodes.push({
      ref: parent,
      groupingOnly: true,
      children: childNodes,
      hours: { agent: roundHours(hours.agent), jon: roundHours(hours.jon) },
      logged: roundHours(hours.agent + hours.jon),
      estimate: roundHours(estimate)
    })
  }
  for (const ref of roots) nodes.push(buildTaskNode(ref, members, details, false))
  nodes.sort((a, b) => a.ref.title.localeCompare(b.ref.title))
  return nodes
}

export function buildSprintColumnFromMembers(
  index: VaultIndex,
  members: TaskRef[],
  details: Map<string, SprintTaskDetails>,
  lane: SprintLane | 'past' | 'matrix',
  tag: string
): SprintColumnModel {
  const projectPaths = new Set<string>()
  for (const member of members) {
    if (!member.projectPath) continue
    projectPaths.add(member.projectPath)
    for (const ancestor of index.ancestorRefs(member.projectPath)) projectPaths.add(ancestor.path)
  }

  const buildProject = (path: string): SprintProjectNode | null => {
    const ref = index.projectRef(path)
    if (!ref || !projectPaths.has(path)) return null
    const children = index
      .childRefs(path)
      .map((child) => buildProject(child.path))
      .filter((node): node is SprintProjectNode => node !== null)
    const tasks = rootTaskNodes(path, members, index, details)
    if (children.length === 0 && tasks.length === 0) return null
    const hours = [...tasks, ...children].reduce(
      (sum, node) => addHours(sum, node.hours),
      { agent: 0, jon: 0 }
    )
    const logged = [...tasks, ...children].reduce((sum, node) => sum + node.logged, 0)
    const estimate = [...tasks, ...children].reduce((sum, node) => sum + node.estimate, 0)
    return {
      ref,
      children,
      tasks,
      hours: { agent: roundHours(hours.agent), jon: roundHours(hours.jon) },
      logged: roundHours(logged),
      estimate: roundHours(estimate)
    }
  }

  const projects = index
    .rootRefs()
    .map((root) => buildProject(root.path))
    .filter((node): node is SprintProjectNode => node !== null)

  const hours = members.reduce((sum, ref) => addHours(sum, ownHours(ref, details)), { agent: 0, jon: 0 })
  let estimate = 0
  const counted = new Set<string>()
  const addEstimate = (ref: TaskRef): void => {
    if (counted.has(ref.id)) return
    counted.add(ref.id)
    const children = memberChildRefs(ref.id, members)
    if (children.length === 0) {
      estimate += ownEstimate(ref, details)
      return
    }
    for (const child of children) addEstimate(child)
  }
  for (const member of members) {
    if (!member.parentId || !members.some((other) => other.id === member.parentId)) addEstimate(member)
  }

  return {
    lane,
    tag,
    cardCount: members.length,
    hours: { agent: roundHours(hours.agent), jon: roundHours(hours.jon) },
    logged: roundHours(hours.agent + hours.jon),
    estimate: roundHours(estimate),
    projects
  }
}

export function buildSprintColumnFromTag(
  index: VaultIndex,
  tag: string,
  details: Map<string, SprintTaskDetails>,
  lane: SprintLane | 'past'
): SprintColumnModel {
  return buildSprintColumnFromMembers(index, sprintMembersForTag(index, tag), details, lane, tag)
}

export function buildSprintColumn(
  index: VaultIndex,
  lane: SprintLane,
  details: Map<string, SprintTaskDetails>
): SprintColumnModel {
  return buildSprintColumnFromTag(index, tagForLane(lane), details, lane)
}

export function liveSprintMembers(index: VaultIndex): TaskRef[] {
  return index.allTaskRefs().filter((ref) => {
    if (ref.archived) return false
    return ref.tags.includes(TAG_SPRINT_CURRENT) || ref.tags.includes(TAG_SPRINT_NEXT)
  })
}

/** Drop Done/Cancelled (and any other complete status) from a sprint member list. */
export function withoutTerminalMembers(members: TaskRef[], statuses: StatusConfig[]): TaskRef[] {
  return members.filter((ref) => !isTerminalStatus(ref.status, statuses))
}

export function buildEisenhowerMatrix(
  index: VaultIndex,
  details: Map<string, SprintTaskDetails>,
  members: TaskRef[] = liveSprintMembers(index)
): EisenhowerMatrixModel {
  const live = members
  const buckets: Record<EisenhowerQuadrant | 'unsorted', TaskRef[]> = {
    I: [],
    II: [],
    III: [],
    IV: [],
    unsorted: []
  }

  for (const ref of live) {
    const urgency = details.get(ref.id)?.urgency
    const quad = deriveEisenhowerQuadrant(ref.priority, urgency)
    if (quad) buckets[quad].push(ref)
    else buckets.unsorted.push(ref)
  }

  const quadrants = {
    I: buildSprintColumnFromMembers(index, buckets.I, details, 'matrix', 'I'),
    II: buildSprintColumnFromMembers(index, buckets.II, details, 'matrix', 'II'),
    III: buildSprintColumnFromMembers(index, buckets.III, details, 'matrix', 'III'),
    IV: buildSprintColumnFromMembers(index, buckets.IV, details, 'matrix', 'IV')
  }

  return {
    quadrants,
    unsorted: buildSprintColumnFromMembers(index, buckets.unsorted, details, 'matrix', 'unsorted')
  }
}
