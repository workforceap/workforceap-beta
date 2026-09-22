/**
 * Signed, single-purpose, expiring tokens for the public application-status
 * link (product call 28a, 2026-09-22).
 *
 * Pattern mirrors lib/security/placementSurveyToken.ts and lib/auth/mfaTrust.ts:
 * base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature). Stateless,
 * so no table is added: the application row is the source of truth and the
 * token only proves "the server emailed this link for this application to the
 * address on file, less than N minutes ago".
 *
 * Binding: the payload carries the application id, the application's own
 * organization id (so the status page can run a tenant-scoped read before it
 * knows anything else) and a keyed hash of the applicant's normalized email.
 * The email itself is never placed in the URL; the status page recomputes the
 * hash from the row it loads and refuses to render when they differ.
 *
 * The signing key is derived from an existing server secret with a purpose
 * label, so a token minted here can never verify as an MFA trust cookie or a
 * placement-survey link, even though they may share the underlying secret.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeEmail } from '@/lib/db/exactEmailMatch';
import {
  APPLICATION_STATUS_LINK_PARAM,
  APPLICATION_STATUS_LINK_PATH,
  APPLICATION_STATUS_LINK_TTL_MINUTES,
} from '@/lib/apply/statusLinkConstants';

export { APPLICATION_STATUS_LINK_PARAM, APPLICATION_STATUS_LINK_TTL_MINUTES };

const TOKEN_VERSION = 1;
const KEY_PURPOSE = 'workforceap:application-status-link:v1';

type ApplicationStatusLinkPayload = {
  v: number;
  /** Application.id */
  sub: string;
  /** Organization.id of the applicant, for the tenant-scoped read. */
  org: string;
  /** Keyed hash of the normalized applicant email. */
  eh: string;
  /** Unix seconds. */
  exp: number;
};

/**
 * Optional explicit secret first, then the existing server secrets already
 * required in production. Links live 30 minutes, so rotating the borrowed
 * secret only invalidates links that are about to expire anyway (unlike the
 * unsubscribe tokens in WAP-177).
 */
function secret(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.APPLICATION_STATUS_LINK_SECRET?.trim();
  if (explicit) return explicit;
  const borrowed = env.AUTH_TRUST_COOKIE_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (!borrowed) {
    throw new Error(
      'No secret available for application status links: set APPLICATION_STATUS_LINK_SECRET, AUTH_TRUST_COOKIE_SECRET or CRON_SECRET',
    );
  }
  return borrowed;
}

function signingKey(): Buffer {
  return createHmac('sha256', secret()).update(KEY_PURPOSE).digest();
}

function sign(encodedPayload: string): Buffer {
  return createHmac('sha256', signingKey()).update(encodedPayload).digest();
}

/** Keyed hash of the normalized email; safe to place in a URL, not reversible by dictionary. */
export function hashEmailForStatusLink(email: string): string {
  return createHmac('sha256', signingKey()).update(`email:${normalizeEmail(email)}`).digest('base64url');
}

/** Constant-time comparison of a token's email hash against a row's email. */
export function emailMatchesStatusLink(emailHash: string, email: string): boolean {
  const expected = Buffer.from(hashEmailForStatusLink(email));
  const actual = Buffer.from(emailHash);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function issueApplicationStatusLinkToken(args: {
  applicationId: string;
  organizationId: string;
  email: string;
  /** Test seam. */
  now?: Date;
  ttlMinutes?: number;
}): string {
  if (!args.applicationId || !args.organizationId) {
    throw new TypeError('applicationId and organizationId are required');
  }
  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const ttlMinutes = args.ttlMinutes ?? APPLICATION_STATUS_LINK_TTL_MINUTES;
  const payload: ApplicationStatusLinkPayload = {
    v: TOKEN_VERSION,
    sub: args.applicationId,
    org: args.organizationId,
    eh: hashEmailForStatusLink(args.email),
    exp: nowSeconds + ttlMinutes * 60,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload).toString('base64url')}`;
}

export type ApplicationStatusLinkVerifyResult =
  | { ok: true; applicationId: string; organizationId: string; emailHash: string; expiresAt: Date }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_version' };

export function verifyApplicationStatusLinkToken(
  token: string | null | undefined,
  now: Date = new Date(),
): ApplicationStatusLinkVerifyResult {
  const value = token?.trim();
  if (!value) return { ok: false, reason: 'malformed' };
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return { ok: false, reason: 'malformed' };

  const encodedPayload = value.slice(0, dot);
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(value.slice(dot + 1), 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expectedSignature = sign(encodedPayload);
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: Partial<ApplicationStatusLinkPayload>;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<ApplicationStatusLinkPayload>;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.v !== TOKEN_VERSION) return { ok: false, reason: 'wrong_version' };
  if (
    typeof payload.sub !== 'string' || !payload.sub ||
    typeof payload.org !== 'string' || !payload.org ||
    typeof payload.eh !== 'string' || !payload.eh ||
    typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSeconds) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    applicationId: payload.sub,
    organizationId: payload.org,
    emailHash: payload.eh,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/** Absolute status-page URL. `baseUrl` is the org's branded origin (no trailing slash). */
export function buildApplicationStatusLinkUrl(token: string, baseUrl: string): string {
  const base = baseUrl.replace(/[\r\n\0]/g, '').trim().replace(/\/$/, '');
  return `${base}${APPLICATION_STATUS_LINK_PATH}?${APPLICATION_STATUS_LINK_PARAM}=${encodeURIComponent(token)}`;
}
