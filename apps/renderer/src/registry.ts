import type { ComponentType } from 'react'
import type { OverlayProps } from '@racedash/core'
import { Gt7 } from './styles/gt7'

export interface RegistryEntry {
  component: ComponentType<OverlayProps>
  width: number
  height: number
  overlayX: number
  overlayY: number
}

export const registry: Record<string, RegistryEntry> = {
  gt7: {
    component: Gt7,
    width: 1200,
    height: 760,
    overlayX: 0,
    overlayY: 0,
  },
}
