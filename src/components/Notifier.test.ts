import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import {
  collectDueReminders,
  pruneNotificationMutes,
  reminderMuteKey,
  toastBurst,
  type CollectDueProject,
  TOAST_CAP
} from './dueReminders'

const NOW = Temporal.PlainDate.from('2026-09-09')

function task(
  id: string,
  title: string,
  due: string,
  patch: Partial<{ status: string; archived: boolean; path: string }> = {}
): CollectDueProject['tasks'][number] {
  return {
    id,
    path: patch.path ?? `Projects/Roadmap/_tasks/${id}.md`,
    title,
    due,
    status: patch.status ?? 'todo',
    archived: patch.archived ?? false
  }
}

function project(
  tasks: CollectDueProject['tasks'],
  patch: Partial<CollectDueProject> = {}
): CollectDueProject {
  return {
    projectPath: 'Projects/Roadmap.md',
    projectTitle: 'Roadmap',
    icon: 'map',
    color: '#8b72be',
    complete: new Set(['done', 'cancelled']),
    tasks,
    ...patch
  }
}

function collect(
  projects: CollectDueProject[],
  opts: { leadDays?: number; mutes?: Record<string, string> } = {}
) {
  return collectDueReminders(projects, {
    leadDays: opts.leadDays ?? 2,
    mutes: opts.mutes ?? {},
    now: NOW
  })
}

describe('collectDueReminders', () => {
  it('sorts oldest overdue first, then today, then soon, then title', () => {
    const reminders = collect([
      project([
        task('t-soon', 'Zebra', '2026-09-11'),
        task('t-today-b', 'Beta', '2026-09-09'),
        task('t-overdue-old', 'Old', '2026-09-01'),
        task('t-today-a', 'Alpha', '2026-09-09'),
        task('t-overdue-new', 'New', '2026-09-07')
      ])
    ])

    expect(reminders.map((r) => r.taskId)).toEqual([
      't-overdue-old',
      't-overdue-new',
      't-today-a',
      't-today-b',
      't-soon'
    ])
    expect(reminders.map((r) => r.kind)).toEqual(['overdue', 'overdue', 'today', 'today', 'soon'])
    expect(reminders[0]?.dueLine).toBe('8d overdue')
    expect(reminders[2]?.dueLine).toBe('Due today')
    expect(reminders[4]?.dueLine).toBe('Due in 2d')
  })

  it('keeps a task inside the lead window and drops one past it', () => {
    const reminders = collect(
      [
        project([
          task('inside', 'Inside', '2026-09-11'),
          task('outside', 'Outside', '2026-09-12')
        ])
      ],
      { leadDays: 2 }
    )

    expect(reminders.map((r) => r.taskId)).toEqual(['inside'])
  })

  it('skips a mute stored for today', () => {
    const due = '2026-09-01'
    const reminders = collect([project([task('muted', 'Muted', due)])], {
      mutes: { [reminderMuteKey('muted', due)]: '2026-09-09' }
    })

    expect(reminders).toEqual([])
  })

  it('includes a mute whose date is not today', () => {
    const due = '2026-09-01'
    const reminders = collect([project([task('back', 'Back', due)])], {
      mutes: { [reminderMuteKey('back', due)]: '2026-09-08' }
    })

    expect(reminders.map((r) => r.taskId)).toEqual(['back'])
  })

  it('skips archived and complete tasks, and a task with no due date', () => {
    const reminders = collect([
      project([
        task('open', 'Open', '2026-09-01'),
        task('done', 'Done', '2026-09-01', { status: 'done' }),
        task('archived', 'Archived', '2026-09-01', { archived: true }),
        task('blank', 'Blank', '')
      ])
    ])

    expect(reminders.map((r) => r.taskId)).toEqual(['open'])
  })

  it('copies the owning project icon and colour', () => {
    const reminders = collect([
      project([task('t1', 'Task', '2026-09-01')], { icon: 'flask-conical', color: '#c47070' })
    ])

    expect(reminders[0]?.icon).toBe('flask-conical')
    expect(reminders[0]?.color).toBe('#c47070')
  })
})

describe('pruneNotificationMutes', () => {
  it('drops keys whose date is not today', () => {
    const { next, changed } = pruneNotificationMutes(
      { 'a:2026-09-01': '2026-09-08', 'b:2026-09-02': '2026-09-09' },
      '2026-09-09'
    )

    expect(changed).toBe(true)
    expect(next).toEqual({ 'b:2026-09-02': '2026-09-09' })
  })

  it('leaves today-only mutes untouched', () => {
    const mutes = { 'a:2026-09-01': '2026-09-09' }
    const { next, changed } = pruneNotificationMutes(mutes, '2026-09-09')

    expect(changed).toBe(false)
    expect(next).toEqual(mutes)
  })
})

describe('toastBurst', () => {
  it('takes the first five un-notified reminders and reverses them for the native stack', () => {
    const reminders = collect([
      project([
        task('1', 'One', '2026-09-01'),
        task('2', 'Two', '2026-09-02'),
        task('3', 'Three', '2026-09-03'),
        task('4', 'Four', '2026-09-04'),
        task('5', 'Five', '2026-09-05'),
        task('6', 'Six', '2026-09-06')
      ])
    ])

    expect(reminders).toHaveLength(6)
    const burst = toastBurst(reminders, new Set())
    expect(burst).toHaveLength(TOAST_CAP)
    expect(burst.map((r) => r.taskId)).toEqual(['5', '4', '3', '2', '1'])
  })

  it('skips reminders already notified and still caps at five', () => {
    const reminders = collect([
      project([
        task('1', 'One', '2026-09-01'),
        task('2', 'Two', '2026-09-02'),
        task('3', 'Three', '2026-09-03')
      ])
    ])

    const burst = toastBurst(reminders, new Set([reminderMuteKey('1', '2026-09-01')]))
    expect(burst.map((r) => r.taskId)).toEqual(['3', '2'])
  })
})
