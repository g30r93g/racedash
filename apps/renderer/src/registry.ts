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
}

export const registry: Record<string, RegistryEntry> = {
  banner: {
    component: Banner,
    width: 1920,
    height: 120,
    overlayX: 0,
    overlayY: 0,
  },
  esports: {
    component: Esports,
    width: 1920,
    height: 228,
    overlayX: 0,
    overlayY: 0,
  },
  minimal: {
    component: Minimal,
    width: 440,
    height: 150,
    overlayX: 48,
    overlayY: 882,
  },
  modern: {
    component: Modern,
    width: 520,
    height: 96,
    overlayX: 0,
    overlayY: 984,
  },
}
