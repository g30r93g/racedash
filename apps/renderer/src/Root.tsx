import React from 'react'
import { Composition } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import type { RegistryEntry } from './registry'
import { registry } from './registry'

const defaultSession: OverlayProps['session'] = {
  driver: { kart: '0', name: 'Preview Driver' },
  laps: [
    { number: 1, lapTime: 68.588, cumulative: 68.588 },
    { number: 2, lapTime: 64.776, cumulative: 133.364 },
    { number: 3, lapTime: 65.218, cumulative: 198.582 },
  ],
  timestamps: [
    { lap: { number: 1, lapTime: 68.588, cumulative: 68.588 }, ytSeconds: 0 },
    { lap: { number: 2, lapTime: 64.776, cumulative: 133.364 }, ytSeconds: 68.588 },
    { lap: { number: 3, lapTime: 65.218, cumulative: 198.582 }, ytSeconds: 133.364 },
  ],
}

const defaultProps: OverlayProps = {
  session: defaultSession,
  fps: 60,
  durationInFrames: 300,
}

// Remotion v4's Composition requires a Zod schema as the first type argument.
// Cast to any to allow OverlayProps without a schema.
const UntypedComposition = Composition as React.ComponentType<any>

function OverlayComposition({ id, entry }: { id: string; entry: RegistryEntry }) {
  return (
    <UntypedComposition
      id={id}
      component={entry.component}
      width={entry.width}
      height={entry.height}
      calculateMetadata={({ props }: { props: OverlayProps }) => ({
        durationInFrames: props.durationInFrames,
        fps: props.fps,
      })}
      defaultProps={defaultProps}
    />
  )
}

export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(registry).map(([id, entry]) => (
      <OverlayComposition key={id} id={id} entry={entry} />
    ))}
  </>
)
