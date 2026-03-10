import type { ComponentType } from 'react'
import type { OverlayProps } from '@racedash/core'
import { Geometric } from './styles/geometric'
import { Esports } from './styles/esports'
import { Minimal } from './styles/minimal'

export interface RegistryEntry {
  component: ComponentType<OverlayProps>
  width: number
  height: number
  overlayX: number
  overlayY: number
}

export const registry: Record<string, RegistryEntry> = {
  geometric: {
    component: Geometric,
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
}
