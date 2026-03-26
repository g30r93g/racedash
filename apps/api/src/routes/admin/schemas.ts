import { z } from 'zod'

const isoDateString = z
  .string()
  .refine((val) => !isNaN(new Date(val).getTime()), { message: 'Must be a valid ISO 8601 date string' })

export const issueLicenseSchema = z
  .object({
    tier: z.enum(['plus', 'pro']),
    startsAt: isoDateString,
    expiresAt: isoDateString,
  })
  .refine((data) => new Date(data.expiresAt) > new Date(data.startsAt), {
    message: 'expiresAt must be after startsAt',
    path: ['expiresAt'],
  })

export const updateLicenseSchema = z
  .object({
    expiresAt: isoDateString.optional(),
    status: z.literal('cancelled').optional(),
  })
  .refine((data) => data.expiresAt || data.status, {
    message: 'At least one of expiresAt or status must be provided',
  })
  .refine((data) => !(data.expiresAt && data.status), {
    message: 'expiresAt and status are mutually exclusive',
  })

export const creditAdjustmentSchema = z.object({
  rcAmount: z
    .number()
    .int()
    .refine((val) => val !== 0, {
      message: 'rcAmount must be a non-zero integer',
    }),
  reason: z.string().min(1, 'reason is required').max(500, 'reason must not exceed 500 characters'),
})

export const userSearchSchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined) return 50
      const num = typeof val === 'string' ? parseInt(val, 10) : val
      return isNaN(num) ? 50 : Math.min(Math.max(num, 1), 100)
    }),
})
