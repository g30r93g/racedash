import { SectionLabel } from '@/components/shared/SectionLabel'
import { OptionGroup } from '@/components/ui/option-group'
import React from 'react'
import { hasCloudLicense } from '@/lib/license'
import type { OutputFrameRate, OutputResolution, RenderMode } from '../../../../../types/ipc'

interface RenderSettingsProps {
  outputResolution: OutputResolution
  setOutputResolution: (v: OutputResolution) => void
  outputFrameRate: OutputFrameRate
  setOutputFrameRate: (v: OutputFrameRate) => void
  renderMode: RenderMode
  setRenderMode: (v: RenderMode) => void
  licenseTier?: 'plus' | 'pro' | null
  disabled: boolean
}

export function RenderSettings({
  outputResolution,
  setOutputResolution,
  outputFrameRate,
  setOutputFrameRate,
  renderMode,
  setRenderMode,
  licenseTier,
  disabled,
}: RenderSettingsProps): React.ReactElement {
  const licensed = hasCloudLicense(licenseTier)

  const resolutionOptions: Array<{ value: OutputResolution; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '2160p', label: licensed ? '4K' : '4K ⚡', disabled: !licensed },
  ]
  const frameRateOptions: Array<{ value: OutputFrameRate; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
    { value: '120', label: licensed ? '120 fps' : '120 fps ⚡', disabled: !licensed },
  ]
  const renderModeOptions: Array<{ value: RenderMode; label: string }> = [
    { value: 'overlay+footage', label: 'Overlay + Footage' },
    { value: 'overlay-only', label: 'Overlay Only' },
  ]

  return (
    <>
      {/* OUTPUT RESOLUTION */}
      <section>
        <SectionLabel>Output Resolution</SectionLabel>
        <OptionGroup
          options={resolutionOptions}
          value={outputResolution}
          onValueChange={setOutputResolution}
          disabled={disabled}
        />
      </section>

      {/* OUTPUT FRAME RATE */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <OptionGroup
          options={frameRateOptions}
          value={outputFrameRate}
          onValueChange={setOutputFrameRate}
          disabled={disabled}
        />
      </section>

      {/* RENDER MODE */}
      <section>
        <SectionLabel>Render Mode</SectionLabel>
        <OptionGroup options={renderModeOptions} value={renderMode} onValueChange={setRenderMode} disabled={disabled} />
      </section>
    </>
  )
}
