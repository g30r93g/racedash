// Client
export { createDb, type DrizzleDb } from './client'

// Schema (all table objects for use in Drizzle queries)
export {
  users,
  licenses,
  creditPacks,
  creditReservations,
  creditReservationPacks,
  jobs,
  socialUploads,
  connectedAccounts,
} from './schema'

// Drizzle pgEnum objects (needed by downstream migration configs)
export {
  licenseTierEnum,
  licenseStatusEnum,
  jobStatusEnum,
  socialUploadStatusEnum,
  reservationStatusEnum,
} from './schema'

// Inferred row types
export type { users as UsersTable } from './schema'
import type { users, licenses, creditPacks, creditReservations, creditReservationPacks, jobs, socialUploads, connectedAccounts } from './schema'
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type License = typeof licenses.$inferSelect
export type NewLicense = typeof licenses.$inferInsert
export type CreditPack = typeof creditPacks.$inferSelect
export type NewCreditPack = typeof creditPacks.$inferInsert
export type CreditReservation = typeof creditReservations.$inferSelect
export type NewCreditReservation = typeof creditReservations.$inferInsert
export type CreditReservationPack = typeof creditReservationPacks.$inferSelect
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type SocialUpload = typeof socialUploads.$inferSelect
export type NewSocialUpload = typeof socialUploads.$inferInsert
export type ConnectedAccount = typeof connectedAccounts.$inferSelect
export type NewConnectedAccount = typeof connectedAccounts.$inferInsert

// Enum types
export type { LicenseTier, LicenseStatus, JobStatus, SocialUploadStatus, ReservationStatus } from './types'
export { LICENSE_TIERS, LICENSE_STATUSES, JOB_STATUSES, SOCIAL_UPLOAD_STATUSES, RESERVATION_STATUSES } from './types'

// Helpers
export {
  reserveCredits,
  releaseCredits,
  consumeCredits,
  getSlotLimit,
  countActiveRenders,
  validateLicenseTier,
  checkLicenseExpiry,
  claimNextQueuedSlotToken,
  computeCredits,
} from './helpers'

export type {
  ReserveCreditsInput,
  ReserveCreditsResult,
  ReleaseCreditsInput,
  ConsumeCreditsInput,
  ValidateLicenseTierInput,
  ValidateLicenseTierResult,
  CheckLicenseExpiryInput,
  CheckLicenseExpiryResult,
  ClaimNextQueuedSlotTokenInput,
  ComputeCreditsInput,
} from './helpers'

// Errors
export { InsufficientCreditsError } from './errors'
