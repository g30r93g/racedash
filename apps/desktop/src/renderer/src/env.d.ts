import type { RacedashAPI } from '../../types/ipc'

declare global {
  interface Window {
    racedash: RacedashAPI
  }
}

export {}
