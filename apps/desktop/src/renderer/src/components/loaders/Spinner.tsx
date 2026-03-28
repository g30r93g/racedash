import React, { CSSProperties, forwardRef } from 'react'
import { useSpinnerConfig } from './SpinnerContext'
import { SpinnerName } from './spinners'
import { useSpinner } from './useSpinner'

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export interface BaseSpinnerProps {
  name?: SpinnerName
  color?: string
  size?: string | number
  speed?: number
  paused?: boolean
  ignoreReducedMotion?: boolean
  className?: string
  style?: CSSProperties
  label?: string
}

export type SpinnerProps = BaseSpinnerProps & Omit<React.HTMLAttributes<HTMLSpanElement>, keyof BaseSpinnerProps>

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { name, color, size, speed, paused, ignoreReducedMotion, className, style, label, ...rest },
  ref,
) {
  const ctx = useSpinnerConfig()
  const resolvedName = name ?? ctx.defaultName
  const resolvedColor = color ?? ctx.defaultColor
  const resolvedSize = size ?? ctx.defaultSize
  const resolvedSpeed = speed ?? ctx.defaultSpeed
  const resolvedIgnore = ignoreReducedMotion ?? !ctx.respectReducedMotion

  const frame = useSpinner(resolvedName, resolvedSpeed, paused ?? false, resolvedIgnore)
  const resolvedLabel = label ?? 'Loading'

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, position: 'relative', ...style }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'monospace',
          lineHeight: 1,
          userSelect: 'none',
          whiteSpace: 'pre',
          color: resolvedColor ?? 'currentColor',
          fontSize: resolvedSize,
        }}
      >
        {frame}
      </span>
      <span role="status" aria-live="polite" style={srOnly}>
        {resolvedLabel}
      </span>
    </span>
  )
})

export interface SpinnerOverlayProps extends BaseSpinnerProps {
  children?: React.ReactNode
  backdrop?: string
  active?: boolean
  containerStyle?: CSSProperties
  containerClassName?: string
}

export function SpinnerOverlay({
  children,
  active = true,
  backdrop = 'rgba(0, 0, 0, 0.35)',
  size = '2rem',
  label = 'Loading',
  containerStyle,
  containerClassName,
  ...spinnerProps
}: SpinnerOverlayProps) {
  return (
    <div className={containerClassName} style={{ position: 'relative', ...containerStyle }} aria-busy={active}>
      {children}
      {active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: backdrop,
            borderRadius: 'inherit',
          }}
        >
          <Spinner {...spinnerProps} size={size} label={label} />
        </div>
      )}
    </div>
  )
}

export interface SpinnerInlineProps extends BaseSpinnerProps {
  children?: React.ReactNode
  gap?: string | number
}

export function SpinnerInline({ children, gap = '0.4em', ...spinnerProps }: SpinnerInlineProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <Spinner {...spinnerProps} />
      {children ? <span>{children}</span> : null}
    </span>
  )
}
