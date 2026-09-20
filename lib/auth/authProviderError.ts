/**
 * Classify a failure from the sign-in provider's admin API (Supabase GoTrue)
 * into a reason the admin UI can act on, without echoing the provider's raw
 * text to the browser (see lib/http/errorResponse.ts for why).
 *
 * Audit 2026-09-20: `POST /api/admin/users` answered 400 "Failed to create
 * user." and `POST /api/admin/partners/{id}/invite` answered 500 "Internal
 * server error" when the provider was unreachable, so the admin could not
 * tell a typo from an outage.
 */

type AuthProviderFailureKind = 'duplicate' | 'validation' | 'unavailable' | 'unknown';

type ProviderErrorShape = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

const DUPLICATE_CODES = new Set(['user_already_exists', 'email_exists', 'phone_exists']);
const VALIDATION_CODES = new Set([
  'validation_failed',
  'email_address_invalid',
  'email_address_not_authorized',
  'weak_password',
  'bad_json',
  'signup_disabled',
  'email_provider_disabled',
]);
const UNAVAILABLE_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** True when `getSupabaseAdmin()` itself refused to build a client (missing env). */
export function isAuthProviderConfigError(error: unknown): boolean {
  const message = readString((error as ProviderErrorShape | null)?.message);
  return /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/i.test(message);
}

export function classifyAuthProviderError(error: unknown): AuthProviderFailureKind {
  if (!error || typeof error !== 'object') return 'unknown';
  const shape = error as ProviderErrorShape;
  const name = readString(shape.name);
  const code = readString(shape.code);
  const message = readString(shape.message);
  const status = typeof shape.status === 'number' ? shape.status : NaN;

  if (DUPLICATE_CODES.has(code) || /already/i.test(message)) {
    return 'duplicate';
  }
  if (isAuthProviderConfigError(error)) return 'unavailable';
  if (
    /Retryable|FetchError|AbortError/i.test(name) ||
    UNAVAILABLE_STATUSES.has(status) ||
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|network|timed? ?out|unavailable|temporarily/i.test(message)
  ) {
    return 'unavailable';
  }
  if (
    VALIDATION_CODES.has(code) ||
    status === 400 ||
    status === 422 ||
    /invalid|validate|format|not allowed|not authorized|disposable|blocked|weak/i.test(message)
  ) {
    return 'validation';
  }
  return 'unknown';
}

type AuthProviderAction = 'create' | 'invite';

/** HTTP status for a classified provider failure. */
export function authProviderFailureStatus(kind: AuthProviderFailureKind): number {
  switch (kind) {
    case 'duplicate':
      return 409;
    case 'unavailable':
      return 503;
    case 'validation':
    case 'unknown':
    default:
      return 400;
  }
}

/**
 * Safe, specific message for the admin. Never includes provider text.
 * Invite messages start with "Invite not sent:" so the partner detail box
 * can render them verbatim.
 */
export function describeAuthProviderFailure(kind: AuthProviderFailureKind, action: AuthProviderAction): string {
  const prefix = action === 'invite' ? 'Invite not sent: ' : '';
  const subject = action === 'invite' ? 'the invite' : 'the account';
  switch (kind) {
    case 'duplicate':
      return action === 'invite'
        ? `${prefix}that email already has an account, but it could not be linked to this partner.`
        : 'That email already has an account. Use the edit or reset tools on the existing user.';
    case 'unavailable':
      return `${prefix}the sign-in provider is unavailable right now, so ${subject} was not created. Try again in a few minutes.`;
    case 'validation':
      return `${prefix}the sign-in provider rejected that email address. Check the spelling and domain, then try again.`;
    case 'unknown':
    default:
      return `${prefix}the sign-in provider could not ${action === 'invite' ? 'send the invite' : 'create the account'}. Try again, and contact support if it keeps failing.`;
  }
}
