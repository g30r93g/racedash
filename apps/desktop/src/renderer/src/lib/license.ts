/** Returns true if the license tier represents an active cloud subscription. */
export function hasCloudLicense(tier: 'plus' | 'pro' | string | null | undefined): boolean {
  return tier === 'plus' || tier === 'pro'
}
