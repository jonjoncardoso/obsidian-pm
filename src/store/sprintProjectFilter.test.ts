import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFakeApp, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, type PMSettings } from '../types'
import { VaultIndex } from './VaultIndex'
import {
  collectSprintFilterGroups,
  filterMembersByProjects,
  sprintUmbrellaPath
} from './sprintProjectFilter'
import { TAG_SPRINT_CURRENT } from './sprintTags'

function projectNote(id: string, title: string, extra = ''): string {
  return `---\npm-project: true\nid: ${id}\ntitle: ${title}\n${extra}---\n\n# ${title}\n`
}

describe('sprintProjectFilter', () => {
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

  it('maps version paths to the umbrella under the root', async () => {
    await vault.create('Projects/Tooling/Tooling.md', projectNote('tooling', 'Tooling'))
    await vault.create(
      'Projects/Tooling/board/board.md',
      projectNote('board', 'board', 'parent: "[[Tooling]]"\n')
    )
    await vault.create(
      'Projects/Tooling/board/v2/v2.md',
      projectNote('v2', 'v2.0 - board', 'parent: "[[board]]"\n')
    )
    index.build()

    expect(sprintUmbrellaPath('Projects/Tooling/board/v2/v2.md', index)).toBe(
      'Projects/Tooling/board/board.md'
    )
    expect(sprintUmbrellaPath('Projects/Tooling/board/board.md', index)).toBe(
      'Projects/Tooling/board/board.md'
    )
  })

  it('hides members under hidden umbrellas and leaves others', async () => {
    await vault.create('Projects/Research/Research.md', projectNote('research', 'Research'))
    await vault.create(
      'Projects/Research/Tutor/Tutor.md',
      projectNote('tutor', 'Tutor Paper', 'parent: "[[Research]]"\n')
    )
    await vault.create(
      'Projects/Research/MA421/MA421.md',
      projectNote('ma421', 'MA421', 'parent: "[[Research]]"\n')
    )
    await vault.create(
      'Projects/Research/Tutor/_tasks/a.md',
      `---
pm-task: true
id: a
projectId: tutor
title: A
status: todo
tags:
  - ${TAG_SPRINT_CURRENT}
---

`
    )
    await vault.create(
      'Projects/Research/MA421/_tasks/b.md',
      `---
pm-task: true
id: b
projectId: ma421
title: B
status: todo
tags:
  - ${TAG_SPRINT_CURRENT}
---

`
    )
    index.build()

    const groups = collectSprintFilterGroups(index)
    expect(groups).toHaveLength(1)
    expect(groups[0].umbrellas.map((u) => u.title).sort()).toEqual(['MA421', 'Tutor Paper'])

    const members = index.allTaskRefs().filter((r) => !r.archived)
    const hidden = ['Projects/Research/MA421/MA421.md']
    const visible = filterMembersByProjects(members, hidden, index)
    expect(visible.map((m) => m.id).sort()).toEqual(['a'])
  })
})
