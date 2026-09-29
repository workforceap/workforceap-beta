export const READ_ONLY_PORTAL_AUDIT_HEADER = 'x-workforceap-read-only-audit';
export const READ_ONLY_PORTAL_AUDIT_TOKEN_COOKIE = 'wap-read-only-portal-audit-token';
/** Legacy public input: middleware must discard it, never accept it as proof. */
export const READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER = 'x-workforceap-read-only-audit-token';

/** Constant-time comparison for the middleware-only audit capability token. */
export function isValidReadOnlyPortalAuditToken(
  candidate: string | null | undefined,
  configured: string | null | undefined,
): boolean {
  const expected = configured?.trim() ?? '';
  const actual = candidate?.trim() ?? '';
  if (expected.length < 32 || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Release audits use a host-bound browser cookie to suppress
 * write-on-read and billable-on-read behavior while rendering authenticated
 * pages. Middleware validates the cookie and mints this internal header only
 * for an authenticated user. The header never grants access or broadens a
 * query; it can only make an already-authorized request less mutating.
 */
export function isReadOnlyPortalAuditHeader(
  source: Pick<Headers, 'get'>,
): boolean {
  return source.get(READ_ONLY_PORTAL_AUDIT_HEADER) === '1';
}
