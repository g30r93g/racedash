import React from 'react'
import type { BannerInfoSegmentContent, LapTimestamp } from '@racedash/core'
import { TimeLabelPanel } from './TimeLabelPanel'

interface Props {
  content: BannerInfoSegmentContent
  timestamps: LapTimestamp[]
  currentIdx: number
  currentTime: number
  isEnd?: boolean
  textColor?: string
  yOffset?: number
  placeholderText?: string
}

export const InfoSegmentPanel: React.FC<Props> = ({ content, ...props }) => {
  if (content === 'none') return null

  return <TimeLabelPanel {...props} variant={content === 'last-lap' ? 'last' : 'best'} />
}
