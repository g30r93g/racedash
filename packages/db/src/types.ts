export const LICENSE_TIERS = ['plus', 'pro'] as const
export type LicenseTier = (typeof LICENSE_TIERS)[number]

export const LICENSE_STATUSES = ['active', 'expired', 'cancelled'] as const
export type LicenseStatus = (typeof LICENSE_STATUSES)[number]

export const JOB_STATUSES = ['uploading', 'queued', 'rendering', 'compositing', 'complete', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const SOCIAL_UPLOAD_STATUSES = ['queued', 'uploading', 'processing', 'live', 'failed'] as const
export type SocialUploadStatus = (typeof SOCIAL_UPLOAD_STATUSES)[number]

export const RESERVATION_STATUSES = ['reserved', 'consumed', 'released'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]
