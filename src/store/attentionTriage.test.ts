import { describe, expect, it } from 'vitest'
import { makeTask, type StatusConfig, type Task } from '../types'
import {
  assignLane,
  buildHoursStrip,
  buildStepSquares,
  buildTriageCards,
  nextDeadline,
  parseTemplateStepId,
  stepIdParts
} from './attentionTriage'

const statuses: StatusConfig[] = [
  { id: 'todo', label: 'To Do', color: '#888', icon: '', complete: false },
  { id: 'in-progress', label: 'In Progress', color: '#8b72be', icon: '', complete: false },
  { id: 'done', label: 'Done', color: '#79b58d', icon: '', complete: true },
  { id: 'cancelled', label: 'Cancelled', color: '#aaa', icon: '', complete: true }
]

function step(id: string, title: string, stepId: string, status = 'todo', due = ''): Task {
  return makeTask({
    id,
    title,
    type: 'subtask',
    status,
    due,
    description: `template_step_id: ${stepId}\n`
  })
}

describe('parseTemplateStepId', () => {
  it('reads the body line', () => {
    expect(parseTemplateStepId('hello\ntemplate_step_id: 05-portal-submit\n')).toBe('05-portal-submit')
    expect(parseTemplateStepId('no id here')).toBeNull()
  })
})

describe('stepIdParts', () => {
  it('splits base and letter variant', () => {
    expect(stepIdParts('05-portal-submit')).toEqual({ base: '05', variant: null })
    expect(stepIdParts('05b-uni-east')).toEqual({ base: '05', variant: 'b' })
  })
})

describe('buildStepSquares', () => {
  it('opens portal into nested programme squares 5.1–5.5', () => {
    const portal = step('p5', '5. Portal / submit', '05-portal-submit', 'in-progress', '2026-12-07')
    portal.subtasks = [
      makeTask({ id: 'p5a', title: '5.1 Uni North MSc', type: 'subtask', status: 'done' }),
      makeTask({ id: 'p5b', title: '5.2 Uni East MBA', type: 'subtask', status: 'todo' }),
      makeTask({ id: 'p5c', title: '5.3 Uni West MPhil', type: 'subtask', status: 'todo' }),
      makeTask({ id: 'p5d', title: '5.4 Uni South MSc', type: 'subtask', status: 'todo' }),
      makeTask({ id: 'p5e', title: '5.5 Uni Central MA', type: 'subtask', status: 'todo' })
    ]
    const parent = makeTask({
      id: 'parent',
      title: 'Parent: letter pipeline',
      subtasks: [
        step('r1', '1. Reply', '01-reply-first-ask', 'done'),
        step('c2', '2. Collect', '02-collect-materials', 'done'),
        step('i3', '3. Ingest', '03-ingest-evidence', 'done'),
        step('d4', '4. Draft', '04-draft-letter', 'done'),
        portal,
        step('cl6', '6. Close', '06-close-loop', 'todo')
      ]
    })
    const squares = buildStepSquares(parent, statuses)
    expect(squares).toHaveLength(6)
    expect(squares[4].panes).toHaveLength(5)
    expect(squares[4].panes.map((p) => p.label)).toEqual(['5.1', '5.2', '5.3', '5.4', '5.5'])
    expect(squares[4].panes[0].fill).toBe('done')
    expect(squares[4].panes[1].fill).toBe('current')
    expect(squares[4].panes.map((p) => p.task.id)).not.toContain('p5')
    expect(squares[0].fill).toBe('done')
  })

  it('falls back to ordered direct subtasks without template_step_id', () => {
    const parent = makeTask({
      id: 'p',
      title: 'Parent',
      subtasks: [
        makeTask({ id: 'a', title: 'A', type: 'subtask', status: 'done', start: '2026-01-01' }),
        makeTask({ id: 'b', title: 'B', type: 'subtask', status: 'todo', start: '2026-01-02' })
      ]
    })
    const squares = buildStepSquares(parent, statuses)
    expect(squares).toHaveLength(6)
    expect(squares[0].fill).toBe('done')
    expect(squares[1].fill).toBe('current')
    expect(squares[2].panes).toHaveLength(0)
  })

  it('keeps steps in slots 1–6 even when only ends are done', () => {
    const parent = makeTask({
      id: 'p',
      title: 'Parent',
      subtasks: [
        step('r', '1. Reply', '01-reply-first-ask', 'done'),
        step('c', '6. Close', '06-close-loop', 'done'),
        step('d', '4. Draft', '04-draft-letter', 'todo')
      ]
    })
    const squares = buildStepSquares(parent, statuses)
    expect(squares).toHaveLength(6)
    expect(squares[0].fill).toBe('done')
    expect(squares[3].fill).toBe('current')
    expect(squares[5].fill).toBe('done')
    expect(squares[1].panes).toHaveLength(0)
  })

  it('places title-numbered steps when template_step_id is missing', () => {
    const parent = makeTask({
      id: 'p',
      title: 'Parent',
      subtasks: [
        makeTask({ id: 'r', title: '1. Reply to first ask', type: 'subtask', status: 'done' }),
        makeTask({ id: 'd', title: '4. Draft letter', type: 'subtask', status: 'todo' }),
        makeTask({ id: 'p5b', title: '5.2 Uni East', type: 'subtask', status: 'todo' })
      ]
    })
    const squares = buildStepSquares(parent, statuses)
    expect(squares[0].primary?.id).toBe('r')
    expect(squares[3].primary?.id).toBe('d')
    expect(squares[4].panes.map((p) => p.task.id)).toEqual(['p5b'])
    expect(squares[4].panes[0].label).toBe('')
  })
})


describe('assignLane', () => {
  it('puts collect next into waiting-student', () => {
    const parent = makeTask({ id: 'p', title: 'S', due: '2026-11-20' })
    const steps = buildStepSquares(
      makeTask({
        ...parent,
        subtasks: [
          step('r', '1. Reply', '01-reply-first-ask', 'done'),
          step('c', '2. Collect', '02-collect-materials', 'todo')
        ]
      }),
      statuses
    )
    expect(assignLane(parent, steps, statuses, '2026-11-11')).toBe('waiting-student')
  })

  it('puts portal without near dues into waiting-portal', () => {
    const parent = makeTask({ id: 'p', title: 'S', due: '2026-12-20' })
    const steps = buildStepSquares(
      makeTask({
        ...parent,
        subtasks: [
          step('d', '4. Draft', '04-draft-letter', 'done'),
          step('p', '5. Portal', '05-portal-submit', 'todo', '2026-12-20')
        ]
      }),
      statuses
    )
    expect(assignLane(parent, steps, statuses, '2026-11-11')).toBe('waiting-portal')
  })

  it('puts draft next into acts-now', () => {
    const parent = makeTask({ id: 'p', title: 'S', due: '2026-11-15' })
    const steps = buildStepSquares(
      makeTask({
        ...parent,
        subtasks: [step('d', '4. Draft letter', '04-draft-letter', 'todo', '2026-11-15')]
      }),
      statuses
    )
    expect(assignLane(parent, steps, statuses, '2026-11-11')).toBe('acts-now')
  })
})

describe('nextDeadline', () => {
  it('picks the earliest incomplete step due, not the parent final due', () => {
    const parent = makeTask({
      id: 'p',
      title: 'Parent',
      due: '2026-12-20',
      subtasks: [
        step('r', '1. Reply', '01-reply-first-ask', 'done', '2026-10-01'),
        step('d', '4. Draft', '04-draft-letter', 'todo', '2026-11-15'),
        step('portal', '5. Portal', '05-portal-submit', 'todo', '2026-12-01')
      ]
    })
    const steps = buildStepSquares(parent, statuses)
    expect(nextDeadline(parent, steps, statuses)).toBe('2026-11-15')
  })

  it('falls back to the parent due when open steps have none', () => {
    const parent = makeTask({
      id: 'p',
      title: 'Parent',
      due: '2026-12-20',
      subtasks: [step('d', '4. Draft', '04-draft-letter', 'todo')]
    })
    const steps = buildStepSquares(parent, statuses)
    expect(nextDeadline(parent, steps, statuses)).toBe('2026-12-20')
  })
})

describe('buildHoursStrip', () => {
  it('fills squares from logged hours', () => {
    const parent = makeTask({
      id: 'p',
      timeEstimate: 4,
      timeLogs: [{ date: '2026-11-01', hours: 2, note: '' }]
    })
    const strip = buildHoursStrip(parent)
    expect(strip.total).toBe(4)
    expect(strip.filled).toBe(2)
  })
})

describe('buildTriageCards', () => {
  it('hides fully complete parents', () => {
    const doneParent = makeTask({
      id: 'done',
      title: 'Done student',
      status: 'done',
      subtasks: [step('r', '1. Reply', '01-reply-first-ask', 'done')]
    })
    const open = makeTask({
      id: 'open',
      title: 'Open student',
      subtasks: [step('d', '4. Draft', '04-draft-letter', 'todo')]
    })
    const cards = buildTriageCards([doneParent, open], statuses, '2026-11-11')
    expect(cards.map((c) => c.parent.id)).toEqual(['open'])
  })
})
