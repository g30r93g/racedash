import { describe, expect, it } from 'vitest'
import { getVideoChoiceLabel } from './select'

describe('getVideoChoiceLabel', () => {
  it('uses basename for Windows paths', () => {
    expect(getVideoChoiceLabel('C:\\Race Footage\\clip1.mp4')).toBe('clip1.mp4')
  })

  it('uses basename for POSIX paths', () => {
    expect(getVideoChoiceLabel('/tmp/clip1.mp4')).toBe('clip1.mp4')
  })
})
