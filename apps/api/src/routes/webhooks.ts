import { FastifyPluginAsync } from 'fastify'
import { Webhook } from 'svix'
import { eq } from 'drizzle-orm'
import { users } from '@racedash/db'
import { getDb } from '../lib/db'
import type { ClerkWebhookResponse, ApiError } from '../types'

interface ClerkWebhookEvent {
  type: string
  data: {
    id: string
    email_addresses?: Array<{ email_address: string }>
    primary_email_address_id?: string
    [key: string]: unknown
  }
}

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Reply: ClerkWebhookResponse | ApiError }>(
    '/api/webhooks/clerk',
    { config: { rawBody: true } },
    async (request, reply) => {
      const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
      if (!webhookSecret) {
        throw new Error('CLERK_WEBHOOK_SECRET environment variable is required')
      }

      const svixId = request.headers['svix-id'] as string | undefined
      const svixTimestamp = request.headers['svix-timestamp'] as string | undefined
      const svixSignature = request.headers['svix-signature'] as string | undefined

      if (!svixId || !svixTimestamp || !svixSignature) {
        reply.status(400).send({
          error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Missing svix headers' },
        })
        return
      }

      const wh = new Webhook(webhookSecret)
      let event: ClerkWebhookEvent

      try {
        const body = request.rawBody ?? JSON.stringify(request.body)
        event = wh.verify(body, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        }) as ClerkWebhookEvent
      } catch {
        reply.status(400).send({
          error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature verification failed' },
        })
        return
      }

      if (event.type === 'user.created') {
        const clerkId = event.data.id
        const emailObj = event.data.email_addresses?.find(
          (e) => e.email_address,
        )
        const email = emailObj?.email_address ?? ''

        const db = getDb()

        // Idempotent: skip if user already exists
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1)

        if (!existing) {
          await db.insert(users).values({ clerkId, email })
        }
      }

      return { received: true }
    },
  )
}

export default webhookRoutes
