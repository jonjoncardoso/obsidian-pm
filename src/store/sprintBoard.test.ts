import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFakeApp, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, type PMSettings } from '../types'
import { VaultIndex } from './VaultIndex'
import {
  buildEisenhowerMatrix,
  buildSprintColumn,
  buildSprintColumnFromTag,
  detailsFromFrontmatter,
  listPastSprintTags,
  liveSprintMembers,
  withoutTerminalMembers
} from './sprintBoard'
import { TAG_SPRINT_CURRENT, TAG_SPRINT_NEXT } from './sprintTags'

function projectNote(id: string, title: string, extra = ''): string {
  return `---\npm-project: true\nid: ${id}\ntitle: ${title}\n${extra}---\n\n# ${title}\n`
}

describe('detailsFromFrontmatter', () => {
  it('reads timeLogs, timeEstimate, and urgency', () => {
    const details = detailsFromFrontmatter({
      timeEstimate: 2,
      timeLogs: [{ date: '2026-09-07', hours: 1, note: 'agent: work' }],
      customFields: { urgency: 'High' }
    })
    expect(details.timeEstimate).toBe(2)
    expect(details.timeLogs).toEqual([{ date: '2026-09-07', hours: 1, note: 'agent: work' }])
    expect(details.urgency).toBe('High')
  })

  it('returns empty details when frontmatter is missing', () => {
    expect(detailsFromFrontmatter(undefined)).toEqual({
      timeLogs: [],
      timeEstimate: undefined,
      urgency: undefined
    })
  })
})

describe('buildSprintColumn', () => {
  let vault: FakeVault
  let app: App
  let settings: PMSettings
  let index: VaultIndex

  beforeEach(() => {
    const fake = makeFakeApp({ liveMetadataCache: true })
    vault = fake.vault
    app = fake.app as unknown as App
    settings = { ...DEFAULT_SETTINGS }
    index = new VaultIndex(app, () => settings)
  })

  it('nests member children, rolls ancestor projects, and splits agent vs Jon hours', async () => {
    await vault.create('Projects/Research/Research.md', projectNote('research', 'Research'))
    await vault.create(
      'Projects/Research/MA421/MA421.md',
      projectNote('ma421', 'MA421', 'parent: "[[Research]]"\n')
    )
    await vault.create(
      'Projects/Research/MA421/_tasks/findings.md',
      `---
pm-task: true
id: findings
projectId: ma421
title: Findings rewrite
status: in-progress
tags:
  - ${TAG_SPRINT_CURRENT}
timeLogs:
  - date: '2026-09-07'
    hours: 1
    note: 'agent: full reader-model read'
  - date: '2026-09-07'
    hours: 0.5
    note: 'Jon: guided voice corrections'
---

`
    )
    await vault.create(
      'Projects/Research/MA421/_tasks/abstract.md',
      `---
pm-task: true
id: abstract
projectId: ma421
title: Write abstract
status: todo
parentId: findings
tags:
  - ${TAG_SPRINT_CURRENT}
timeEstimate: 2
---

`
    )
    await vault.create(
      'Projects/Research/MA421/_tasks/untagged.md',
      `---
pm-task: true
id: other
projectId: ma421
title: Not in sprint
status: todo
---

`
    )
    index.build()

    const details = new Map([
      [
        'findings',
        {
          timeLogs: [
            { date: '2026-09-07', hours: 1, note: 'agent: full reader-model read' },
            { date: '2026-09-07', hours: 0.5, note: 'Jon: guided voice corrections' }
          ],
          timeEstimate: undefined,
          urgency: undefined
        }
      ],
      ['abstract', { timeLogs: [], timeEstimate: 2, urgency: undefined }]
    ])

    const column = buildSprintColumn(index, 'current', details)

    expect(column.cardCount).toBe(2)
    expect(column.hours).toEqual({ agent: 1, jon: 0.5 })
    expect(column.logged).toBe(1.5)
    expect(column.estimate).toBe(2)
    expect(column.projects.map((p) => p.ref.title)).toEqual(['Research'])
    expect(column.projects[0].logged).toBe(1.5)
    expect(column.projects[0].estimate).toBe(2)
    expect(column.projects[0].hours).toEqual({ agent: 1, jon: 0.5 })
    expect(column.projects[0].children.map((p) => p.ref.title)).toEqual(['MA421'])
    expect(column.projects[0].children[0].logged).toBe(1.5)
    expect(column.projects[0].children[0].estimate).toBe(2)
    const tasks = column.projects[0].children[0].tasks
    expect(tasks.map((t) => t.ref.id)).toEqual(['findings'])
    expect(tasks[0].children.map((t) => t.ref.id)).toEqual(['abstract'])
    expect(tasks[0].children[0].estimate).toBe(2)
    expect(tasks.map((t) => t.ref.id)).not.toContain('other')
  })

  it('reads a past sprint-* tag with the same rollup', async () => {
    await vault.create('Projects/Research/Research.md', projectNote('research', 'Research'))
    await vault.create(
      'Projects/Research/_tasks/closed.md',
      `---
pm-task: true
id: closed
projectId: research
title: Closed card
status: done
tags:
  - sprint-2026-W36
timeEstimate: 1
---

`
    )
    await vault.create(
      'Projects/Research/_tasks/older.md',
      `---
pm-task: true
id: older
projectId: research
title: Older week
status: done
tags:
  - sprint-2026-W35
---

`
    )
    index.build()
    expect(listPastSprintTags(index)).toEqual(['sprint-2026-W36', 'sprint-2026-W35'])
    const column = buildSprintColumnFromTag(
      index,
      'sprint-2026-W36',
      new Map([['closed', { timeLogs: [], timeEstimate: 1, urgency: undefined }]]),
      'past'
    )
    expect(column.lane).toBe('past')
    expect(column.tag).toBe('sprint-2026-W36')
    expect(column.cardCount).toBe(1)
    expect(column.estimate).toBe(1)
    expect(column.projects[0].logged).toBe(0)
    expect(column.projects[0].estimate).toBe(1)
  })
})

describe('buildEisenhowerMatrix', () => {
  let vault: FakeVault
  let app: App
  let settings: PMSettings
  let index: VaultIndex

  beforeEach(() => {
    const fake = makeFakeApp({ liveMetadataCache: true })
    vault = fake.vault
    app = fake.app as unknown as App
    settings = { ...DEFAULT_SETTINGS }
    index = new VaultIndex(app, () => settings)
  })

  it('buckets live sprint cards by derived quadrant and leaves unset urgency unsorted', async () => {
    await vault.create('Projects/Research/Research.md', projectNote('research', 'Research'))
    await vault.create(
      'Projects/Research/_tasks/do-now.md',
      `---
pm-task: true
id: do-now
projectId: research
title: Do now
status: todo
priority: high
tags:
  - ${TAG_SPRINT_CURRENT}
customFields:
  urgency: High
---

`
    )
    await vault.create(
      'Projects/Research/_tasks/schedule.md',
      `---
pm-task: true
id: schedule
projectId: research
title: Schedule
status: todo
priority: high
tags:
  - ${TAG_SPRINT_NEXT}
customFields:
  urgency: Medium
---

`
    )
    await vault.create(
      'Projects/Research/_tasks/delegate.md',
      `---
pm-task: true
id: delegate
projectId: research
title: Delegate
status: todo
priority: medium
tags:
  - ${TAG_SPRINT_CURRENT}
customFields:
  urgency: Medium
---

`
    )
    await vault.create(
      'Projects/Research/_tasks/unsorted.md',
      `---
pm-task: true
id: unsorted
projectId: research
title: No urgency
status: todo
priority: high
tags:
  - ${TAG_SPRINT_CURRENT}
---

`
    )
    index.build()

    const details = new Map([
      ['do-now', { timeLogs: [], timeEstimate: undefined, urgency: 'High' }],
      ['schedule', { timeLogs: [], timeEstimate: undefined, urgency: 'Medium' }],
      ['delegate', { timeLogs: [], timeEstimate: undefined, urgency: 'Medium' }],
      ['unsorted', { timeLogs: [], timeEstimate: undefined, urgency: undefined }]
    ])

    const matrix = buildEisenhowerMatrix(index, details)
    expect(matrix.quadrants.I.cardCount).toBe(1)
    expect(matrix.quadrants.I.projects[0].tasks.map((t) => t.ref.id)).toEqual(['do-now'])
    expect(matrix.quadrants.II.cardCount).toBe(1)
    expect(matrix.quadrants.II.projects[0].tasks.map((t) => t.ref.id)).toEqual(['schedule'])
    expect(matrix.quadrants.III.cardCount).toBe(1)
    expect(matrix.quadrants.III.projects[0].tasks.map((t) => t.ref.id)).toEqual(['delegate'])
    expect(matrix.quadrants.IV.cardCount).toBe(0)
    expect(matrix.unsorted.cardCount).toBe(1)
    expect(matrix.unsorted.projects[0].tasks.map((t) => t.ref.id)).toEqual(['unsorted'])
  })

  it('accepts a prefiltered member list so Hide done can drop terminal cards', async () => {
    await vault.create('Projects/Research/Research.md', projectNote('research', 'Research'))
    await vault.create(
      'Projects/Research/_tasks/open.md',
      `---
pm-task: true
id: open
projectId: research
title: Still open
status: todo
priority: high
tags:
  - ${TAG_SPRINT_CURRENT}
customFields:
  urgency: High
---

`
    )
    await vault.create(
      'Projects/Research/_tasks/finished.md',
      `---
pm-task: true
id: finished
projectId: research
title: Finished
status: done
priority: high
tags:
  - ${TAG_SPRINT_CURRENT}
customFields:
  urgency: High
---

`
    )
    index.build()

    const details = new Map([
      ['open', { timeLogs: [], timeEstimate: undefined, urgency: 'High' }],
      ['finished', { timeLogs: [], timeEstimate: undefined, urgency: 'High' }]
    ])
    const live = withoutTerminalMembers(liveSprintMembers(index), settings.statuses)
    const matrix = buildEisenhowerMatrix(index, details, live)
    expect(matrix.quadrants.I.cardCount).toBe(1)
    expect(matrix.quadrants.I.projects[0].tasks.map((t) => t.ref.id)).toEqual(['open'])
  })
})
