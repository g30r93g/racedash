import { eq } from 'drizzle-orm'
import { licenses, creditPacks, type DrizzleDb } from '@racedash/db'

/**
 * Returns true if a license row already exists for this subscription ID.
 * Used to enforce idempotency on subscription.created webhooks.
 */
export async function licenseExistsForSubscription(db: DrizzleDb, stripeSubscriptionId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: licenses.id })
    .from(licenses)
    .where(eq(licenses.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1)
  return !!existing
}

/**
 * Returns true if a credit pack row already exists for this payment intent ID.
 * Used to enforce idempotency on checkout.session.completed webhooks.
 * The credit_packs table has a UNIQUE constraint on stripe_payment_intent_id,
 * but pre-checking avoids noisy constraint errors.
 */
export async function creditPackExistsForPaymentIntent(db: DrizzleDb, stripePaymentIntentId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: creditPacks.id })
    .from(creditPacks)
    .where(eq(creditPacks.stripePaymentIntentId, stripePaymentIntentId))
    .limit(1)
  return !!existing
}
