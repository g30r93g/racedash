/** Maps Stripe Price IDs to license tiers. */
export const STRIPE_PRICE_TO_TIER: Record<string, 'plus' | 'pro'> = {
  'price_plus_annual': 'plus',
  'price_pro_annual': 'pro',
}

/** Maps pack sizes to Stripe Price IDs for credit packs. */
export const CREDIT_PACK_PRICES: Record<number, string> = {
  50: 'price_credits_50',
  100: 'price_credits_100',
  250: 'price_credits_250',
  500: 'price_credits_500',
}

export function tierFromPriceId(priceId: string): 'plus' | 'pro' | null {
  return STRIPE_PRICE_TO_TIER[priceId] ?? null
}

export function priceIdForTier(tier: 'plus' | 'pro'): string | null {
  const entry = Object.entries(STRIPE_PRICE_TO_TIER).find(([, t]) => t === tier)
  return entry?.[0] ?? null
}

export function priceIdForPack(packSize: number): string | null {
  return CREDIT_PACK_PRICES[packSize] ?? null
}
