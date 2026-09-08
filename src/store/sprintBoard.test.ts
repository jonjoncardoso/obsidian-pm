import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFakeApp, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, type PMSettings } from '../types'
import { VaultIndex } from './VaultIndex'
import { buildSprintColumn, detailsFromFrontmatter } from './sprintBoard'
import { TAG_SPRINT_CURRENT } from './sprintTags'

function projectNote(id: string, title: string, extra = ''): string {
  return `---\npm-project: true\nid: ${id}\ntitle: ${title}\n${extra}---\n\n# ${title}\n`
}

describe('detailsFromFrontmatter', () => {
  it('reads timeLogs and timeEstimate', () => {
    const details = detailsFromFrontmatter({
      timeEstimate: 2,
      timeLogs: [{ date: '2026-09-07', hours: 1, note: 'agent: work' }]
    })
    expect(details.timeEstimate).toBe(2)
    expect(details.timeLogs).toEqual([{ date: '2026-09-07', hours: 1, note: 'agent: work' }])
  })

  it('returns empty details when frontmatter is missing', () => {
    expect(detailsFromFrontmatter(undefined)).toEqual({ timeLogs: [], timeEstimate: undefined })
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
          timeEstimate: undefined
        }
      ],
      ['abstract', { timeLogs: [], timeEstimate: 2 }]
    ])

    const column = buildSprintColumn(index, 'current', details)

    expect(column.cardCount).toBe(2)
    expect(column.hours).toEqual({ agent: 1, jon: 0.5 })
    expect(column.logged).toBe(1.5)
    expect(column.estimate).toBe(2)
    expect(column.projects.map((p) => p.ref.title)).toEqual(['Research'])
    expect(column.projects[0].children.map((p) => p.ref.title)).toEqual(['MA421'])
    const tasks = column.projects[0].children[0].tasks
    expect(tasks.map((t) => t.ref.id)).toEqual(['findings'])
    expect(tasks[0].children.map((t) => t.ref.id)).toEqual(['abstract'])
    expect(tasks[0].children[0].estimate).toBe(2)
    expect(tasks.map((t) => t.ref.id)).not.toContain('other')
  })
})
