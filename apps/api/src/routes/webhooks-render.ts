import { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import { SendTaskSuccessCommand } from '@aws-sdk/client-sfn'
import { claimNextQueuedSlotToken } from '@racedash/db'
import { getDb } from '../lib/db'
import { sfn } from '../lib/aws'
import type { RenderWebhookPayload, ApiError } from '../types'

function verifyWebhookSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const webhooksRenderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Reply: ApiError | string }>('/api/webhooks/render', async (request, reply) => {
    const secret = process.env.WEBHOOK_SECRET
    if (!secret) throw new Error('WEBHOOK_SECRET is required')

    const provided = request.headers['x-webhook-secret'] as string | undefined
    if (!provided) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing x-webhook-secret header' },
      })
      return
    }

    if (!verifyWebhookSecret(provided, secret)) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' },
      })
      return
    }

    const payload = request.body as RenderWebhookPayload
    const { status, input } = payload.detail
    const terminalStates = ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED']

    if (terminalStates.includes(status)) {
      const { userId } = JSON.parse(input) as { jobId: string; userId: string }
      const db = getDb()
      const token = await claimNextQueuedSlotToken({ db, userId })

      if (token) {
        await sfn.send(new SendTaskSuccessCommand({
          taskToken: token,
          output: '{}',
        }))
      }
    }

    reply.status(200).send('')
  })
}

export default webhooksRenderRoutes
