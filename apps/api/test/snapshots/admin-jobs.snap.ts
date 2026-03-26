import { describe, it, expect } from 'vitest'
import type { AdminJobListResponse, AdminJobDetailResponse } from '../../src/types'

describe('admin jobs response shapes', () => {
  it('job list and job detail match the expected snapshot', () => {
    const listResponse: AdminJobListResponse = {
      jobs: [
        {
          id: 'job_001',
          userEmail: 'alice@example.com',
          status: 'rendering',
          rcCost: null,
          createdAt: '2026-03-20T08:00:00.000Z',
          updatedAt: '2026-03-20T08:02:00.000Z',
          durationSec: null,
          errorMessage: null,
        },
        {
          id: 'job_002',
          userEmail: 'bob@example.com',
          status: 'complete',
          rcCost: 25,
          createdAt: '2026-03-19T14:00:00.000Z',
          updatedAt: '2026-03-19T14:10:00.000Z',
          durationSec: 600,
          errorMessage: null,
        },
        {
          id: 'job_003',
          userEmail: 'charlie@example.com',
          status: 'failed',
          rcCost: null,
          createdAt: '2026-03-19T12:00:00.000Z',
          updatedAt: '2026-03-19T12:03:00.000Z',
          durationSec: 180,
          errorMessage: 'Out of memory during compositing',
        },
      ],
      nextCursor: 'job_003',
    }

    const detailResponse: AdminJobDetailResponse = {
      job: {
        id: 'job_001',
        userId: 'usr_001',
        userEmail: 'alice@example.com',
        status: 'rendering',
        config: { resolution: '1080p', frameRate: '60', renderMode: 'full', overlayStyle: 'default' },
        inputS3Keys: ['uploads/job_001/input.mp4'],
        uploadIds: null,
        outputS3Key: null,
        downloadExpiresAt: null,
        slotTaskToken: 'tok_slot_abc',
        renderTaskToken: 'tok_render_def',
        remotionRenderId: 'rem_xyz',
        rcCost: null,
        sfnExecutionArn: 'arn:aws:states:eu-west-2:123456:execution:racedash-render:job_001',
        errorMessage: null,
        createdAt: '2026-03-20T08:00:00.000Z',
        updatedAt: '2026-03-20T08:02:00.000Z',
      },
      sfnConsoleUrl:
        'https://eu-west-2.console.aws.amazon.com/states/home?region=eu-west-2#/executions/details/arn:aws:states:eu-west-2:123456:execution:racedash-render:job_001',
      creditReservation: {
        id: 'cr_001',
        rcAmount: 20,
        status: 'held',
        createdAt: '2026-03-20T08:00:00.000Z',
        settledAt: null,
        packs: [{ packId: 'cp_001', packName: 'Starter Pack', rcDeducted: 20 }],
      },
    }

    expect({ list: listResponse, detail: detailResponse }).toMatchSnapshot()
  })
})
