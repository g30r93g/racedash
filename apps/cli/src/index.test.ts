import { describe, it, expect } from 'vitest'
import { formatDoctorDiagnostics, resolveOutputResolutionPreset } from './index'

describe('resolveOutputResolutionPreset', () => {
  it('returns undefined when the flag is omitted', () => {
    expect(resolveOutputResolutionPreset(undefined)).toBeUndefined()
  })

  it('maps 1440p to 2560x1440', () => {
    expect(resolveOutputResolutionPreset('1440p')).toEqual({
      preset: '1440p',
      width: 2560,
      height: 1440,
    })
  })

  it('rejects unsupported presets', () => {
    expect(() => resolveOutputResolutionPreset('720p')).toThrow(
      '--output-resolution must be one of: 1080p, 1440p, 2160p',
    )
  })
})

describe('formatDoctorDiagnostics', () => {
  it('formats aligned doctor output', () => {
    expect(
      formatDoctorDiagnostics([
        { label: 'Platform', value: 'win32' },
        { label: 'Decode pref', value: 'd3d11va -> dxva2 -> software' },
      ]),
    ).toBe(['racedash doctor', '', '  Platform     win32', '  Decode pref  d3d11va -> dxva2 -> software'].join('\n'))
  })
})
