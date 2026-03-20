import { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import { SendTaskSuccessCommand, SendTaskFailureCommand } from '@aws-sdk/client-sfn'
import { sfn } from '../lib/aws'
import type { RemotionWebhookPayload } from '../types'

function verifyRemotionSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

const webhooksRemotionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/webhooks/remotion', async (request, reply) => {
    const secret = process.env.REMOTION_WEBHOOK_SECRET
    if (!secret) throw new Error('REMOTION_WEBHOOK_SECRET is required')

    const signature = request.headers['x-remotion-signature'] as string | undefined
    if (!signature) {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing X-Remotion-Signature header' },
      } as any)
      return
    }

    const rawBody = request.rawBody ?? JSON.stringify(request.body)

    try {
      if (!verifyRemotionSignature(rawBody, signature, secret)) {
        reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' },
        } as any)
        return
      }
    } catch {
      reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' },
      } as any)
      return
    }

    const payload = request.body as RemotionWebhookPayload
    const { taskToken } = payload.customData

    if (payload.type === 'success') {
      await sfn.send(new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({ renderId: payload.renderId }),
      }))
    } else {
      const errorMessage = payload.errors?.map((e) => e.message).join('; ') ?? `Remotion render ${payload.type}`
      await sfn.send(new SendTaskFailureCommand({
        taskToken,
        error: payload.type,
        cause: errorMessage,
      }))
    }

    reply.status(200).send()
  })
}

export default webhooksRemotionRoutes
