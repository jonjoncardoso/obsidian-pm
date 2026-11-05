import { describe, expect, it } from 'vitest'
import {
  effortBand,
  effortWeight,
  formatEffortLabel,
  isEffortOverrun
} from './sprintEffort'

describe('effortWeight', () => {
  it('uses the larger of logged and estimate', () => {
    expect(effortWeight(6, 2)).toBe(6)
    expect(effortWeight(1, 4)).toBe(4)
    expect(effortWeight(0, 0)).toBe(0)
  })
})

describe('effortBand', () => {
  it('maps weight to bands', () => {
    expect(effortBand(0)).toBe('none')
    expect(effortBand(0.3)).toBe('s')
    expect(effortBand(1)).toBe('m')
    expect(effortBand(2.9)).toBe('m')
    expect(effortBand(3)).toBe('l')
    expect(effortBand(5.9)).toBe('l')
    expect(effortBand(6)).toBe('xl')
  })
})

describe('isEffortOverrun', () => {
  it('requires a positive estimate and logged above it', () => {
    expect(isEffortOverrun(6, 2)).toBe(true)
    expect(isEffortOverrun(2, 2)).toBe(false)
    expect(isEffortOverrun(6, 0)).toBe(false)
  })
})

describe('formatEffortLabel', () => {
  it('formats logged over estimate, or logged alone', () => {
    expect(formatEffortLabel(6.3, 2)).toBe('6.3/2h')
    expect(formatEffortLabel(1.5, 0)).toBe('1.5h')
    expect(formatEffortLabel(0, 4)).toBe('0/4h')
    expect(formatEffortLabel(0, 0)).toBeNull()
  })
})
