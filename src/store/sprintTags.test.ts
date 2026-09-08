import { describe, expect, it } from 'vitest'
import {
  TAG_SPRINT_CURRENT,
  TAG_SPRINT_NEXT,
  applySprintTag,
  hoursByActor,
  sprintMembership,
  toggleSprintTag
} from './sprintTags'

describe('applySprintTag', () => {
  it('adds the current tag and strips the next tag', () => {
    expect(applySprintTag(['design', TAG_SPRINT_NEXT], 'current')).toEqual(['design', TAG_SPRINT_CURRENT])
  })

  it('adds the next tag and strips the current tag', () => {
    expect(applySprintTag([TAG_SPRINT_CURRENT], 'next')).toEqual([TAG_SPRINT_NEXT])
  })

  it('removes both live tags when lane is null', () => {
    expect(applySprintTag(['design', TAG_SPRINT_CURRENT], null)).toEqual(['design'])
  })

  it('does not duplicate a tag that is already present', () => {
    expect(applySprintTag([TAG_SPRINT_CURRENT, 'design'], 'current')).toEqual(['design', TAG_SPRINT_CURRENT])
  })
})

describe('sprintMembership', () => {
  it('prefers current when both live tags are present', () => {
    expect(sprintMembership([TAG_SPRINT_NEXT, TAG_SPRINT_CURRENT])).toBe('current')
  })

  it('returns null when neither live tag is present', () => {
    expect(sprintMembership(['design'])).toBeNull()
  })
})

describe('toggleSprintTag', () => {
  it('removes the current tag when it is already set', () => {
    expect(toggleSprintTag([TAG_SPRINT_CURRENT], 'current')).toEqual([])
  })

  it('switches from next to current', () => {
    expect(toggleSprintTag([TAG_SPRINT_NEXT], 'current')).toEqual([TAG_SPRINT_CURRENT])
  })
})

describe('hoursByActor', () => {
  it('splits agent vs Jon the way the Findings rewrite logs do', () => {
    const split = hoursByActor([
      {
        date: '2026-09-07',
        hours: 1,
        note: 'agent: full reader-model read of paper.tex'
      },
      {
        date: '2026-09-07',
        hours: 0.5,
        note: 'Jon: guided reader-model voice corrections'
      }
    ])
    expect(split).toEqual({ agent: 1, jon: 0.5 })
  })

  it('counts an unprefixed note as Jon', () => {
    expect(hoursByActor([{ date: '2026-09-08', hours: 2, note: 'wrote the outline' }])).toEqual({
      agent: 0,
      jon: 2
    })
  })
})
