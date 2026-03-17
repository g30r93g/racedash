import { describe, it, expect } from 'vitest'
import { getRenderExperimentalWarning } from './operations'

describe('getRenderExperimentalWarning', () => {
  it('returns undefined on non-Windows platforms', () => {
    expect(getRenderExperimentalWarning('darwin')).toBeUndefined()
    expect(getRenderExperimentalWarning('linux')).toBeUndefined()
  })

  it('returns a warning string on Windows', () => {
    const warning = getRenderExperimentalWarning('win32')
    expect(typeof warning).toBe('string')
    expect(warning!.length).toBeGreaterThan(0)
  })
})
