import { FastifyPluginAsync } from 'fastify'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { users, licenses, creditPacks } from '@racedash/db'
import { getDb } from '../lib/db'
import { getStripe } from '../lib/stripe'
import { tierFromPriceId } from '../lib/stripe-prices'
import { licenseExistsForSubscription, creditPackExistsForPaymentIntent } from '../lib/webhook-idempotency'
import type { StripeWebhookResponse, ApiError } from '../types'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}

function mapSubscriptionStatus(stripeStatus: string): 'active' | 'expired' | 'cancelled' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'expired'
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled'
    default:
      return 'expired'
  }
}

const webhooksStripeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Reply: StripeWebhookResponse | ApiError }>(
    '/api/webhooks/stripe',
    { config: { rawBody: true } },
    async (request, reply) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required')
      }

      const signature = request.headers['stripe-signature'] as string | undefined
      if (!signature) {
        reply.status(400).send({
          error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Missing stripe-signature header' },
        })
        return
      }

      const stripe = getStripe()
      let event: Stripe.Event

      try {
        const rawBody = request.rawBody ?? JSON.stringify(request.body)
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
      } catch {
        reply.status(400).send({
          error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature verification failed' },
        })
        return
      }

      const db = getDb()

      switch (event.type) {
        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription
          const stripeSubscriptionId = subscription.id
          const stripeCustomerId = typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id

          // Idempotency: skip if already processed
          if (await licenseExistsForSubscription(db, stripeSubscriptionId)) break

          const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, stripeCustomerId))
            .limit(1)

          if (!user) {
            fastify.log.warn({ stripeCustomerId }, 'Webhook: no user found for stripe_customer_id')
            break
          }

          const item = subscription.items.data[0]
          const priceId = item?.price?.id
          const tier = priceId ? tierFromPriceId(priceId) : null
          if (!tier) {
            fastify.log.warn({ priceId }, 'Webhook: unknown price ID in subscription')
            break
          }

          try {
            await db.insert(licenses).values({
              userId: user.id,
              tier,
              stripeCustomerId,
              stripeSubscriptionId,
              status: 'active',
              startsAt: new Date(item.current_period_start * 1000),
              expiresAt: new Date(item.current_period_end * 1000),
            })
          } catch (err) {
            // Silently ignore UNIQUE constraint violations (concurrent duplicate delivery)
            if (!isUniqueViolation(err)) throw err
          }
          break
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription
          const stripeSubscriptionId = subscription.id

          const [license] = await db
            .select()
            .from(licenses)
            .where(eq(licenses.stripeSubscriptionId, stripeSubscriptionId))
            .limit(1)

          if (!license) {
            fastify.log.warn({ stripeSubscriptionId }, 'Webhook: no license found for subscription')
            break
          }

          const updItem = subscription.items.data[0]
          const priceId = updItem?.price?.id
          const tier = priceId ? tierFromPriceId(priceId) : license.tier
          const status = mapSubscriptionStatus(subscription.status)

          await db
            .update(licenses)
            .set({
              tier: tier ?? license.tier,
              status,
              startsAt: new Date(updItem.current_period_start * 1000),
              expiresAt: new Date(updItem.current_period_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(licenses.stripeSubscriptionId, stripeSubscriptionId))
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription
          const stripeSubscriptionId = subscription.id

          const [license] = await db
            .select({ id: licenses.id })
            .from(licenses)
            .where(eq(licenses.stripeSubscriptionId, stripeSubscriptionId))
            .limit(1)

          if (!license) {
            fastify.log.warn({ stripeSubscriptionId }, 'Webhook: no license found for deleted subscription')
            break
          }

          await db
            .update(licenses)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(licenses.stripeSubscriptionId, stripeSubscriptionId))
          break
        }

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          if (session.metadata?.type !== 'credit_pack') break
          if (session.payment_status !== 'paid') break

          const stripeCustomerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id

          if (!stripeCustomerId) break

          const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, stripeCustomerId))
            .limit(1)

          if (!user) {
            fastify.log.warn({ stripeCustomerId }, 'Webhook: no user found for credit pack purchase')
            break
          }

          const packSize = parseInt(session.metadata.pack_size ?? '0', 10)
          if (!packSize || packSize <= 0) {
            fastify.log.warn({ metadata: session.metadata }, 'Webhook: invalid pack_size in metadata')
            break
          }

          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id

          if (!paymentIntentId) break

          // Idempotency: skip if already processed
          if (await creditPackExistsForPaymentIntent(db, paymentIntentId)) break

          const now = new Date()
          const expiresAt = new Date(now)
          expiresAt.setFullYear(expiresAt.getFullYear() + 1)

          try {
            await db.insert(creditPacks).values({
              userId: user.id,
              packName: `${packSize} RC Pack`,
              rcTotal: packSize,
              rcRemaining: packSize,
              priceGbp: String((session.amount_total ?? 0) / 100),
              purchasedAt: now,
              expiresAt,
              stripePaymentIntentId: paymentIntentId,
            })
          } catch (err) {
            // Silently ignore UNIQUE constraint violations (concurrent duplicate delivery)
            if (!isUniqueViolation(err)) throw err
          }
          break
        }

        default:
          // Unhandled event type — ignore silently
          break
      }

      return { received: true }
    },
  )
}

export default webhooksStripeRoutes
