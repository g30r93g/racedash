import { describe, it, expect } from 'vitest'
import type { AdminOverviewResponse } from '../../src/types'

describe('admin stats overview response shape', () => {
  it('matches the expected snapshot', () => {
    const response: AdminOverviewResponse = {
      inFlight: {
        uploading: 2,
        queued: 5,
        rendering: 1,
        compositing: 0,
      },
      completedToday: 14,
      failedToday: 1,
      failureRate7d: 3.2,
      recentFailedJobs: [
        {
          id: 'job_01',
          userEmail: 'user@example.com',
          errorMessage: 'Render timeout after 300s',
          failedAt: '2026-03-20T10:30:00.000Z',
        },
        {
          id: 'job_02',
          userEmail: 'other@example.com',
          errorMessage: null,
          failedAt: '2026-03-20T09:15:00.000Z',
        },
      ],
    }

    expect(response).toMatchSnapshot()
  })
})
