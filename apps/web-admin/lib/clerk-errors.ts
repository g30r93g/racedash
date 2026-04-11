/** User-friendly error messages for common Clerk error codes */
const ERROR_MESSAGES: Record<string, string> = {
  // Sign-in errors
  form_identifier_not_found: 'No account found with this email address.',
  form_password_incorrect: 'Incorrect password. Please try again.',
  form_password_pwned:
    'This password has been found in a data breach. Please choose a different password.',
  strategy_for_user_invalid: 'This sign-in method is not available for your account.',

  // Verification errors
  form_code_incorrect: 'Incorrect verification code. Please check your email and try again.',
  verification_expired: 'Verification code has expired. Please request a new one.',
  verification_failed: 'Verification failed. Please try again.',

  // Rate limiting
  too_many_requests: 'Too many attempts. Please wait a moment and try again.',
}

interface ClerkErrorLike {
  code?: string
  message?: string
  longMessage?: string
  errors?: ClerkErrorLike[]
}

/**
 * Extract a user-friendly message from a Clerk error.
 * Falls back to the raw error message if no mapping exists.
 */
export function formatClerkError(err: unknown): string {
  const clerkErr = err as ClerkErrorLike
  if (clerkErr?.code && ERROR_MESSAGES[clerkErr.code]) {
    return ERROR_MESSAGES[clerkErr.code]
  }

  if (clerkErr?.errors?.length) {
    const first = clerkErr.errors[0]
    if (first.code && ERROR_MESSAGES[first.code]) {
      return ERROR_MESSAGES[first.code]
    }
    return first.longMessage ?? first.message ?? 'An error occurred. Please try again.'
  }

  if (clerkErr?.longMessage) return clerkErr.longMessage
  if (clerkErr?.message) return clerkErr.message

  if (err instanceof Error) return err.message

  return 'An unexpected error occurred. Please try again.'
}
