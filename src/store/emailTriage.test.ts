import { describe, expect, it } from 'vitest'
import { makeTask, type StatusConfig, type Task } from '../types'
import {
  buildEmailTriageCards,
  groupEmailByLane,
  itemKind,
  parseNextStep,
  parseParentRef,
  resolveTaskRef,
  wikilinkTarget
} from './emailTriage'

const statuses: StatusConfig[] = [
  { id: 'todo', label: 'To Do', color: '#888', icon: '', complete: false },
  { id: 'in-progress', label: 'In Progress', color: '#8b72be', icon: '', complete: false },
  { id: 'blocked', label: 'Blocked', color: '#c45c58', icon: '', complete: false },
  { id: 'done', label: 'Done', color: '#79b58d', icon: '', complete: true },
  { id: 'cancelled', label: 'Cancelled', color: '#aaa', icon: '', complete: true }
]

function parent(id: string, title: string, status = 'todo'): Task {
  return makeTask({
    id,
    title,
    type: 'task',
    status,
    description: `source: mail-scan requests-promises\n## Mail index\n\n| date | folder | id |\n`
  })
}

function item(
  id: string,
  kind: 'request' | 'promise',
  parentId: string,
  status = 'todo',
  due = '',
  nextStep?: string
): Task {
  const next = nextStep ? `**Next step: ${nextStep}**\n\n` : ''
  return makeTask({
    id,
    title: `${kind}: ${id}`,
    type: 'subtask',
    status,
    due,
    description: `Parent: [[${parentId}|Parent]]\n\n${next}template_step_id: ${kind}\n`
  })
}

describe('wikilinkTarget', () => {
  it('strips the label', () => {
    expect(wikilinkTarget('[[codio-demo-session-29oct26|Codio]]')).toBe('codio-demo-session-29oct26')
    expect(wikilinkTarget('bare-id')).toBe('bare-id')
  })
})

describe('parseParentRef', () => {
  it('reads the body Parent line', () => {
    expect(parseParentRef('Parent: [[abc-29oct26|Title]]\n')).toBe('abc-29oct26')
    expect(parseParentRef('no parent')).toBeNull()
  })
})

describe('parseNextStep', () => {
  it('prefers the bold next step line', () => {
    expect(parseNextStep('**Next step: Add a payment method**\n')).toBe('Add a payment method')
  })
})

describe('itemKind', () => {
  it('reads template_step_id', () => {
    expect(itemKind(makeTask({ description: 'template_step_id: request\n' }))).toBe('request')
    expect(itemKind(makeTask({ description: 'template_step_id: promise\n' }))).toBe('promise')
  })
})

describe('resolveTaskRef', () => {
  it('matches a truncated frontmatter id to the dated task id', () => {
    const task = parent('codio-demo-session-29oct26', 'Codio')
    const byId = new Map([[task.id, task]])
    expect(resolveTaskRef('[[codio-demo-session|Codio]]', byId)?.id).toBe('codio-demo-session-29oct26')
  })
})

describe('buildEmailTriageCards', () => {
  it('lanes open requests to Act now and open promises to Deliver', () => {
    const threadA = parent('a-29oct26', 'Thread A')
    const threadB = parent('b-29oct26', 'Thread B')
    const req = item('req-1', 'request', 'a-29oct26', 'todo', '2026-11-12', 'Reply to Nasreen')
    const prom = item('prom-1', 'promise', 'b-29oct26', 'todo', '2026-11-13', 'Send the recording')
    const cards = buildEmailTriageCards([threadA, threadB, req, prom], statuses)
    const groups = groupEmailByLane(cards)
    expect(groups['acts-now']).toHaveLength(1)
    expect(groups['acts-now'][0].parent.id).toBe('a-29oct26')
    expect(groups['acts-now'][0].nextAction).toBe('Reply to Nasreen')
    expect(groups.deliver).toHaveLength(1)
    expect(groups.deliver[0].parent.id).toBe('b-29oct26')
    expect(groups.deliver[0].openPromises).toHaveLength(1)
  })

  it('puts blocked parents in Waiting even with open requests', () => {
    const thread = parent('c-29oct26', 'Blocked thread', 'blocked')
    const req = item('req-2', 'request', 'c-29oct26')
    const cards = buildEmailTriageCards([thread, req], statuses)
    expect(cards[0].lane).toBe('waiting')
  })

  it('parks a mail parent with no open children', () => {
    const thread = parent('d-29oct26', 'Quiet thread')
    const doneReq = item('req-3', 'request', 'd-29oct26', 'done')
    const cards = buildEmailTriageCards([thread, doneReq], statuses)
    expect(cards[0].lane).toBe('parked')
    expect(cards[0].openRequests).toHaveLength(0)
  })

  it('prefers Act now when both request and promise are open', () => {
    const thread = parent('e-29oct26', 'Both')
    const req = item('req-4', 'request', 'e-29oct26')
    const prom = item('prom-2', 'promise', 'e-29oct26')
    const cards = buildEmailTriageCards([thread, req, prom], statuses)
    expect(cards[0].lane).toBe('acts-now')
    expect(cards[0].openRequests).toHaveLength(1)
    expect(cards[0].openPromises).toHaveLength(1)
  })
})
