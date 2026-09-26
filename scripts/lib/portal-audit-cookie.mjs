/** A browser-managed host cookie keeps the capability off cross-host redirects. */
export const PORTAL_AUDIT_TOKEN_COOKIE_NAME = 'wap-read-only-portal-audit-token';

export async function installReadOnlyAuditCookie(context, trustedOrigin, token) {
  const target = new URL(trustedOrigin);
  if (target.origin !== trustedOrigin || !['http:', 'https:'].includes(target.protocol)) {
    throw new Error('read_only_audit_cookie_origin_invalid');
  }
  if (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('read_only_audit_cookie_origin_invalid');
  }
  if (typeof token !== 'string' || token.trim().length < 32) {
    throw new Error('read_only_audit_capability_invalid');
  }
  await context.addCookies([{
    name: PORTAL_AUDIT_TOKEN_COOKIE_NAME,
    value: token.trim(),
    url: `${trustedOrigin}/`,
    httpOnly: true,
    secure: target.protocol === 'https:',
    sameSite: 'Strict',
  }]);
}

/** Role storage state may be copied in memory, but must not carry the secret. */
export function stripReadOnlyAuditCookieFromStorageState(storageState) {
  return {
    ...storageState,
    cookies: storageState.cookies.filter((cookie) => cookie.name !== PORTAL_AUDIT_TOKEN_COOKIE_NAME),
  };
}
