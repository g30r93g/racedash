import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt } from 'drizzle-orm'
import { users, licenses } from '@racedash/db'
import { getDb } from '../lib/db'
import { getStripe } from '../lib/stripe'
import { priceIdForTier } from '../lib/stripe-prices'
import type { CheckoutResponse, CreateSubscriptionCheckoutRequest } from '../types'

const stripeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateSubscriptionCheckoutRequest; Reply: CheckoutResponse }>(
    '/api/stripe/checkout',
    async (request, reply) => {
      const { tier } = request.body ?? {}

      if (tier !== 'plus' && tier !== 'pro') {
        reply.status(400).send({
          error: { code: 'INVALID_TIER', message: 'tier must be "plus" or "pro"' },
        } as any)
        return
      }

      const db = getDb()
      const { userId: clerkUserId } = request.clerk

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1)

      if (!user) {
        reply.status(404).send({
          error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
        } as any)
        return
      }

      // Check for existing active subscription
      const [existingLicense] = await db
        .select({ id: licenses.id })
        .from(licenses)
        .where(
          and(
            eq(licenses.userId, user.id),
            eq(licenses.status, 'active'),
            gt(licenses.expiresAt, new Date()),
          ),
        )
        .limit(1)

      if (existingLicense) {
        reply.status(409).send({
          error: { code: 'SUBSCRIPTION_EXISTS', message: 'User already has an active subscription' },
        } as any)
        return
      }

      const stripe = getStripe()

      // Create or reuse Stripe Customer
      let stripeCustomerId = user.stripeCustomerId
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({ email: user.email })
        stripeCustomerId = customer.id
        await db
          .update(users)
          .set({ stripeCustomerId })
          .where(eq(users.id, user.id))
      }

      const priceId = priceIdForTier(tier)
      if (!priceId) {
        reply.status(400).send({
          error: { code: 'INVALID_TIER', message: 'No price configured for this tier' },
        } as any)
        return
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: stripeCustomerId,
          line_items: [{ price: priceId, quantity: 1 }],
          automatic_tax: { enabled: true },
          customer_update: { address: 'auto' },
          success_url: 'https://racedash.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'https://racedash.com/checkout/cancel',
          metadata: { user_id: user.id, tier },
        })

        return {
          checkoutUrl: session.url!,
          sessionId: session.id,
        }
      } catch (err) {
        fastify.log.error(err, 'Stripe checkout session creation failed')
        reply.status(502).send({
          error: { code: 'STRIPE_ERROR', message: 'Failed to create checkout session' },
        } as any)
      }
    },
  )
}

export default stripeRoutes
