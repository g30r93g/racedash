/**
 * Stripe Price ID configuration.
 *
 * All price IDs are read from environment variables so they can differ between
 * test-mode and live-mode Stripe accounts without code changes.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} environment variable is required`)
  return value
}

/** Maps Stripe Price IDs to license tiers (populated lazily on first access). */
let priceTierMap: Record<string, 'plus' | 'pro'> | null = null

function getPriceTierMap(): Record<string, 'plus' | 'pro'> {
  if (!priceTierMap) {
    priceTierMap = {
      [requireEnv('STRIPE_PRICE_PLUS')]: 'plus',
      [requireEnv('STRIPE_PRICE_PRO')]: 'pro',
    }
  }
  return priceTierMap
}

/** Maps pack sizes to Stripe Price IDs (populated lazily on first access). */
let packPriceMap: Record<number, string> | null = null

function getPackPriceMap(): Record<number, string> {
  if (!packPriceMap) {
    packPriceMap = {
      50: requireEnv('STRIPE_PRICE_CREDITS_50'),
      100: requireEnv('STRIPE_PRICE_CREDITS_100'),
      250: requireEnv('STRIPE_PRICE_CREDITS_250'),
      500: requireEnv('STRIPE_PRICE_CREDITS_500'),
    }
  }
  return packPriceMap
}

export function tierFromPriceId(priceId: string): 'plus' | 'pro' | null {
  return getPriceTierMap()[priceId] ?? null
}

export function priceIdForTier(tier: 'plus' | 'pro'): string | null {
  const entry = Object.entries(getPriceTierMap()).find(([, t]) => t === tier)
  return entry?.[0] ?? null
}

export function priceIdForPack(packSize: number): string | null {
  return getPackPriceMap()[packSize] ?? null
}

/**
 * Reset cached maps (for testing only).
 * @internal
 */
export function _resetPriceMaps(): void {
  priceTierMap = null
  packPriceMap = null
}
