import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt } from 'drizzle-orm'
import { users, licenses } from '@racedash/db'
import { getDb } from '../lib/db'
import { getStripe } from '../lib/stripe'
import { priceIdForPack } from '../lib/stripe-prices'
import type { CheckoutResponse, CreateCreditCheckoutRequest, ApiError } from '../types'

const stripeCreditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateCreditCheckoutRequest; Reply: CheckoutResponse | ApiError }>(
    '/api/stripe/credits/checkout',
    async (request, reply) => {
      const { packSize } = request.body ?? {}
      const priceId = priceIdForPack(packSize)

      if (!priceId) {
        reply.status(400).send({
          error: { code: 'INVALID_PACK_SIZE', message: 'packSize must be 50, 100, 250, or 500' },
        })
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
        })
        return
      }

      // Must have active license to purchase credits
      const [activeLicense] = await db
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

      if (!activeLicense) {
        reply.status(403).send({
          error: { code: 'LICENSE_REQUIRED', message: 'An active license is required to purchase credits' },
        })
        return
      }

      const stripe = getStripe()

      // Ensure Stripe Customer exists
      let stripeCustomerId = user.stripeCustomerId
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({ email: user.email })
        stripeCustomerId = customer.id
        await db
          .update(users)
          .set({ stripeCustomerId })
          .where(eq(users.id, user.id))
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: stripeCustomerId,
          line_items: [{ price: priceId, quantity: 1 }],
          automatic_tax: { enabled: true },
          success_url: 'https://racedash.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'https://racedash.com/checkout/cancel',
          metadata: {
            user_id: user.id,
            pack_size: String(packSize),
            type: 'credit_pack',
          },
        })

        return {
          checkoutUrl: session.url!,
          sessionId: session.id,
        }
      } catch (err) {
        fastify.log.error(err, 'Stripe credit checkout session creation failed')
        reply.status(502).send({
          error: { code: 'STRIPE_ERROR', message: 'Failed to create checkout session' },
        })
      }
    },
  )
}

export default stripeCreditRoutes
