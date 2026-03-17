import { test, expect } from 'vitest'
import type { RacedashAPI } from '../../types/ipc'

// Type-level test: confirm updater methods exist on the API surface.
// This file has no runtime assertions — it fails to compile if types are missing.
type _CheckAPI = {
  onUpdateAvailable: RacedashAPI['onUpdateAvailable']
  onUpdateDownloaded: RacedashAPI['onUpdateDownloaded']
  onUpdateError: RacedashAPI['onUpdateError']
  installUpdate: RacedashAPI['installUpdate']
}

test('RacedashAPI has updater methods', () => {
  // Intentionally empty — type checking is the test
  expect(true).toBe(true)
})
