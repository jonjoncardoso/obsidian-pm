import { describe, expect, it } from 'vitest'
import { makeTask } from '../types'
import { flattenTasks } from './TaskTreeOps'
import { closeWeekConfirmCopy, sprintConfirmCopy, sprintTreeSize } from './sprintApply'

describe('sprintTreeSize', () => {
  it('matches flattenTasks length including the root', () => {
    const child = makeTask({ id: 'c', title: 'Child' })
    const root = makeTask({ id: 'r', title: 'Root', subtasks: [child] })
    expect(sprintTreeSize(root)).toBe(flattenTasks([root]).length)
    expect(sprintTreeSize(root)).toBe(2)
  })

  it('is 1 for a leaf', () => {
    expect(sprintTreeSize(makeTask({ id: 'leaf' }))).toBe(1)
  })
})

describe('closeWeekConfirmCopy', () => {
  it('names both live counts and the past tag', () => {
    const copy = closeWeekConfirmCopy(12, 4, 'sprint-2026-W37')
    expect(copy.message).toBe(
      '12 cards tagged week-sprint become sprint-2026-W37. 4 cards tagged next-sprint become week-sprint.'
    )
    expect(copy.confirmLabel).toBe('Close week')
  })
})

describe('sprintConfirmCopy', () => {
  it('names This week when adding', () => {
    const copy = sprintConfirmCopy(true, 'current', 12)
    expect(copy.message).toBe('This will add ALL children to This week.')
    expect(copy.confirmLabel).toBe('Add 12 tasks')
  })

  it('names Next when removing', () => {
    const copy = sprintConfirmCopy(false, 'next', 3)
    expect(copy.message).toBe('This will remove ALL children from Next.')
    expect(copy.confirmLabel).toBe('Remove 3 tasks')
  })
})
