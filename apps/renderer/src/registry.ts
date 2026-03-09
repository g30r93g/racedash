import type { ComponentType } from 'react'
import type { OverlayProps } from '@racedash/core'
import { Geometric } from './styles/geometric'

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
}
