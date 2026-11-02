import { describe, expect, it } from 'vitest'
import { deriveEisenhowerQuadrant, importanceRank } from './eisenhower'

describe('importanceRank', () => {
  it('treats high and critical as High', () => {
    expect(importanceRank('high')).toBe('high')
    expect(importanceRank('critical')).toBe('high')
    expect(importanceRank('High')).toBe('high')
  })

  it('treats medium and low as other', () => {
    expect(importanceRank('medium')).toBe('other')
    expect(importanceRank('low')).toBe('other')
  })
})

describe('deriveEisenhowerQuadrant', () => {
  it('returns null when urgency is missing', () => {
    expect(deriveEisenhowerQuadrant('high', undefined)).toBeNull()
    expect(deriveEisenhowerQuadrant('high', '')).toBeNull()
    expect(deriveEisenhowerQuadrant('high', '  ')).toBeNull()
  })

  it('maps High+High to I', () => {
    expect(deriveEisenhowerQuadrant('high', 'High')).toBe('I')
  })

  it('maps High+Medium to II', () => {
    expect(deriveEisenhowerQuadrant('high', 'Medium')).toBe('II')
  })

  it('maps critical+High to I', () => {
    expect(deriveEisenhowerQuadrant('critical', 'High')).toBe('I')
  })

  it('maps Medium+Medium to III', () => {
    expect(deriveEisenhowerQuadrant('medium', 'Medium')).toBe('III')
  })

  it('maps Medium+Low to IV', () => {
    expect(deriveEisenhowerQuadrant('medium', 'Low')).toBe('IV')
  })

  it('maps Medium+High to III', () => {
    expect(deriveEisenhowerQuadrant('medium', 'High')).toBe('III')
  })

  it('maps low+Low to IV', () => {
    expect(deriveEisenhowerQuadrant('low', 'Low')).toBe('IV')
  })
})
