import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../types'
import type { SprintTaskNode } from './sprintBoard'
import {
  collectFlatSprintRoots,
  compareFlatSprintGroups,
  flatGroupIsTerminal,
  flatNestedCardCount,
  flatOwnEffort,
  flatRowEffort,
  sortedFlatSprintRoots
} from './sprintFlatGroups'
import type { SprintColumnModel, SprintProjectNode } from './sprintBoard'

function ref(
  id: string,
  patch: Partial<SprintTaskNode['ref']> = {}
): SprintTaskNode['ref'] {
  return {
    id,
    title: id,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    tags: [],
    due: '',
    completed: '',
    start: '',
    progress: 0,
    assignees: [],
    dependencies: [],
    parentId: '',
    projectId: 'p',
    projectPath: 'Projects/P',
    path: `Projects/P/_tasks/${id}.md`,
    archived: false,
    timeEstimate: 0,
    ...patch
  } as SprintTaskNode['ref']
}

function node(
  id: string,
  opts: {
    groupingOnly?: boolean
    children?: SprintTaskNode[]
    logged?: number
    estimate?: number
    status?: string
    type?: 'task' | 'subtask' | 'milestone'
    parentId?: string
    completed?: string
  } = {}
): SprintTaskNode {
  return {
    ref: ref(id, {
      status: opts.status ?? 'todo',
      type: opts.type ?? 'task',
      parentId: opts.parentId ?? '',
      completed: opts.completed ?? ''
    }),
    groupingOnly: Boolean(opts.groupingOnly),
    children: opts.children ?? [],
    hours: { agent: opts.logged ?? 0, jon: 0 },
    logged: opts.logged ?? 0,
    estimate: opts.estimate ?? 0
  }
}

function columnWithTasks(tasks: SprintTaskNode[]): SprintColumnModel {
  const project: SprintProjectNode = {
    ref: {
      id: 'p',
      title: 'P',
      path: 'Projects/P',
      color: '',
      icon: '',
      teamMembers: [],
      customFields: [],
      parentPath: undefined,
      ownStatusIds: null,
      completeStatusIds: null,
      autoArchiveDays: null,
      createdAt: 0,
      lastEdited: 0
    },
    children: [],
    tasks,
    hours: { agent: 0, jon: 0 },
    logged: 0,
    estimate: 0
  }
  return {
    lane: 'matrix',
    tag: 'I',
    cardCount: tasks.length,
    hours: { agent: 0, jon: 0 },
    logged: 0,
    estimate: 0,
    projects: [project]
  }
}

describe('collectFlatSprintRoots', () => {
  it('keeps roots and nested children without flattening', () => {
    const childA = node('a', { type: 'subtask', parentId: 'parent', logged: 1, estimate: 1 })
    const childB = node('b', { type: 'subtask', parentId: 'parent', logged: 2, estimate: 2 })
    const parent = node('parent', { children: [childA, childB], logged: 3, estimate: 3 })
    const roots = collectFlatSprintRoots(columnWithTasks([parent]))
    expect(roots).toHaveLength(1)
    expect(roots[0].ref.id).toBe('parent')
    expect(roots[0].children.map((c) => c.ref.id)).toEqual(['a', 'b'])
  })

  it('keeps groupingOnly roots', () => {
    const child = node('sub', { type: 'subtask', parentId: 'agg', logged: 1, estimate: 1 })
    const group = node('agg', { groupingOnly: true, children: [child], logged: 1, estimate: 1 })
    const roots = collectFlatSprintRoots(columnWithTasks([group]))
    expect(roots[0].groupingOnly).toBe(true)
    expect(roots[0].children).toHaveLength(1)
  })
})

describe('flatGroupIsTerminal', () => {
  const statuses = DEFAULT_SETTINGS.statuses

  it('treats a Done groupingOnly parent with an open child as open', () => {
    const child = node('sub', { status: 'todo', type: 'subtask' })
    const group = node('agg', { groupingOnly: true, status: 'done', children: [child] })
    expect(flatGroupIsTerminal(group, statuses)).toBe(false)
  })

  it('treats a group of Done children as terminal', () => {
    const child = node('sub', { status: 'done', type: 'subtask', completed: '2026-11-01' })
    const group = node('agg', { groupingOnly: true, status: 'done', children: [child] })
    expect(flatGroupIsTerminal(group, statuses)).toBe(true)
  })
})

describe('flatRowEffort', () => {
  it('uses the node rollup for a real parent with children', () => {
    const child = node('sub', { logged: 2, estimate: 2 })
    const parent = node('parent', { children: [child], logged: 5, estimate: 4 })
    expect(flatRowEffort(parent, new Map())).toEqual({ logged: 5, estimate: 4 })
  })

  it('uses node totals for groupingOnly', () => {
    const child = node('sub', { logged: 2, estimate: 2 })
    const group = node('agg', { groupingOnly: true, children: [child], logged: 2, estimate: 2 })
    expect(flatRowEffort(group, new Map())).toEqual({ logged: 2, estimate: 2 })
  })

  it('flatOwnEffort reads timeLogs and estimate', () => {
    const details = new Map([
      [
        'x',
        {
          timeLogs: [
            { date: '2026-11-05', hours: 0.5, note: 'agent: a' },
            { date: '2026-11-05', hours: 0.5, note: 'Jon: b' }
          ],
          timeEstimate: 3,
          urgency: undefined
        }
      ]
    ])
    expect(flatOwnEffort(ref('x'), details)).toEqual({ logged: 1, estimate: 3 })
  })

  it('counts nested cards under a Flat root', () => {
    const deep = node('deep', { type: 'subtask' })
    const mid = node('mid', { type: 'subtask', children: [deep] })
    const root = node('root', { children: [mid, node('sib', { type: 'subtask' })] })
    expect(flatNestedCardCount(root)).toBe(3)
  })
})

describe('compareFlatSprintGroups', () => {
  const statuses = DEFAULT_SETTINGS.statuses
  const priorities = DEFAULT_SETTINGS.priorities

  it('sorts open groups above terminal even when the groupingOnly parent is Done', () => {
    const openChild = node('open-sub', { status: 'todo', logged: 1, estimate: 1 })
    const openGroup = node('open-agg', {
      groupingOnly: true,
      status: 'done',
      children: [openChild],
      logged: 1,
      estimate: 1
    })
    const doneChild = node('done-sub', {
      status: 'done',
      completed: '2026-11-01',
      logged: 9,
      estimate: 9
    })
    const doneGroup = node('done-agg', {
      groupingOnly: true,
      status: 'done',
      children: [doneChild],
      logged: 9,
      estimate: 9,
      completed: '2026-11-01'
    })
    const sorted = sortedFlatSprintRoots(
      columnWithTasks([doneGroup, openGroup]),
      statuses,
      priorities
    )
    expect(sorted.map((n) => n.ref.id)).toEqual(['open-agg', 'done-agg'])
  })

  it('orders open groups by heavier effort first', () => {
    const light = node('light', { logged: 0.3, estimate: 0.3 })
    const heavy = node('heavy', { logged: 2.5, estimate: 2.5 })
    expect(compareFlatSprintGroups(light, heavy, statuses, priorities)).toBeGreaterThan(0)
  })
})
