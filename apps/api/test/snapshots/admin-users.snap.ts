import { describe, it, expect } from 'vitest'
import type { AdminUserListResponse, AdminUserDetailResponse } from '../../src/types'

describe('admin users response shapes', () => {
  it('user list and user detail match the expected snapshot', () => {
    const listResponse: AdminUserListResponse = {
      users: [
        {
          id: 'usr_001',
          clerkId: 'clerk_abc',
          email: 'alice@example.com',
          licenseTier: 'pro',
          createdAt: '2026-01-15T08:00:00.000Z',
        },
        {
          id: 'usr_002',
          clerkId: 'clerk_def',
          email: 'bob@example.com',
          licenseTier: null,
          createdAt: '2026-02-20T12:30:00.000Z',
        },
      ],
      nextCursor: 'usr_002',
    }

    const detailResponse: AdminUserDetailResponse = {
      user: {
        id: 'usr_001',
        clerkId: 'clerk_abc',
        email: 'alice@example.com',
        billingCountry: 'GB',
        stripeCustomerId: 'cus_stripe123',
        createdAt: '2026-01-15T08:00:00.000Z',
      },
      licenses: [
        {
          id: 'lic_001',
          tier: 'pro',
          status: 'active',
          stripeSubscriptionId: 'sub_stripe456',
          startsAt: '2026-01-15T00:00:00.000Z',
          expiresAt: '2027-01-15T00:00:00.000Z',
          createdAt: '2026-01-15T08:00:00.000Z',
          updatedAt: '2026-01-15T08:00:00.000Z',
        },
      ],
      totalRc: 42,
      creditPacks: [
        {
          id: 'cp_001',
          packName: 'Starter Pack',
          rcTotal: 100,
          rcRemaining: 42,
          priceGbp: '9.99',
          purchasedAt: '2026-01-20T10:00:00.000Z',
          expiresAt: '2027-01-20T10:00:00.000Z',
        },
      ],
      recentJobs: [
        {
          id: 'job_001',
          status: 'complete',
          rcCost: 15,
          createdAt: '2026-03-18T14:00:00.000Z',
          updatedAt: '2026-03-18T14:05:00.000Z',
        },
        {
          id: 'job_002',
          status: 'queued',
          rcCost: null,
          createdAt: '2026-03-20T09:00:00.000Z',
          updatedAt: '2026-03-20T09:00:00.000Z',
        },
      ],
    }

    expect({ list: listResponse, detail: detailResponse }).toMatchSnapshot()
  })
})
