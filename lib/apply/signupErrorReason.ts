/**
 * Stable reason codes on `/api/apply/signup` error responses (WAP-242 item 3).
 * The form maps each code to a translated `apply.*` message and to the field
 * it belongs to; the response's English `error` text stays for logs and older
 * clients. The weak-password case uses `WEAK_PASSWORD_REASON` from
 * `lib/auth/authProviderError`.
 */
export const SIGNUP_ERROR_REASONS = [
  'rate_limited',
  'request_unreadable',
  'invalid_field',
  'service_unavailable',
  'security_check_required',
  'security_check_failed',
  'program_unmatched',
  'already_signed_in',
  'email_exists',
  'account_recovery_required',
] as const;

export type SignupErrorReason = (typeof SIGNUP_ERROR_REASONS)[number];

export function isSignupErrorReason(value: unknown): value is SignupErrorReason {
  return typeof value === 'string' && (SIGNUP_ERROR_REASONS as readonly string[]).includes(value);
}
