import type { ComponentType } from 'react'
import type { OverlayProps } from '@racedash/core'
import { Banner } from './styles/banner'
import { Esports } from './styles/esports'
import { Minimal } from './styles/minimal'
import { Modern } from './styles/modern'

export interface RegistryEntry {
  component: ComponentType<OverlayProps>
  width: number
  height: number
  overlayX: number
  overlayY: number
  /** If true, the composition canvas scales to match videoWidth at render time. Use for full-width overlays only. */
  scaleWithVideo?: boolean
}

export const registry: Record<string, RegistryEntry> = {
  banner: {
    component: Banner,
    width: 1920,
    height: 120,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  esports: {
    component: Esports,
    width: 1920,
    height: 250,   // box (210) + top/bottom margin (20 each) at 1920-reference scale
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  minimal: {
    component: Minimal,
    width: 1920,
    height: 190,   // card (150) + top/bottom margin (20 each) at 1920-reference scale
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  modern: {
    component: Modern,
    width: 520,
    height: 96,
    overlayX: 0,
    overlayY: 984,
  },
}
