import { eq, and, gt, desc, inArray, sql } from 'drizzle-orm'
import { licenses } from '../schema/licenses'
import { jobs } from '../schema/jobs'
import type { LicenseTier, LicenseStatus } from '../types'
import type { DrizzleDb } from '../client'

const TIER_RANK: Record<LicenseTier, number> = {
  plus: 1,
  pro: 2,
}

export function getSlotLimit(tier: LicenseTier): 1 | 3 {
  switch (tier) {
    case 'plus':
      return 1
    case 'pro':
      return 3
    default:
      throw new Error(`Unrecognized license tier: ${tier satisfies never}`)
  }
}

export async function countActiveRenders(db: DrizzleDb, userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.status, ['rendering', 'compositing'])))

  return result?.count ?? 0
}

export interface ValidateLicenseTierInput {
  db: DrizzleDb
  userId: string
  requiredTier: LicenseTier
}

export interface ValidateLicenseTierResult {
  valid: boolean
  activeLicense: {
    id: string
    tier: LicenseTier
    expiresAt: Date
  } | null
}

export async function validateLicenseTier(input: ValidateLicenseTierInput): Promise<ValidateLicenseTierResult> {
  const { db, userId, requiredTier } = input

  const [license] = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.userId, userId), eq(licenses.status, 'active'), gt(licenses.expiresAt, new Date())))
    .orderBy(desc(licenses.expiresAt))
    .limit(1)

  if (!license) {
    return { valid: false, activeLicense: null }
  }

  const hasRequiredTier = TIER_RANK[license.tier] >= TIER_RANK[requiredTier]

  return {
    valid: hasRequiredTier,
    activeLicense: {
      id: license.id,
      tier: license.tier,
      expiresAt: license.expiresAt,
    },
  }
}

export interface CheckLicenseExpiryInput {
  db: DrizzleDb
  userId: string
}

export interface CheckLicenseExpiryResult {
  hasActiveLicense: boolean
  license: {
    id: string
    tier: LicenseTier
    status: LicenseStatus
    expiresAt: Date
  } | null
}

export async function checkLicenseExpiry(input: CheckLicenseExpiryInput): Promise<CheckLicenseExpiryResult> {
  const { db, userId } = input

  const [license] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.userId, userId))
    .orderBy(desc(licenses.createdAt))
    .limit(1)

  if (!license) {
    return { hasActiveLicense: false, license: null }
  }

  const isActive = license.status === 'active' && license.expiresAt > new Date()

  return {
    hasActiveLicense: isActive,
    license: {
      id: license.id,
      tier: license.tier,
      status: license.status,
      expiresAt: license.expiresAt,
    },
  }
}
