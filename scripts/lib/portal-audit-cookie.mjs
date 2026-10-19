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

/** Confirms the capability cookie is in the jar without reading its value. */
export async function assertReadOnlyAuditCookieInstalled(context, trustedOrigin) {
  const target = new URL(trustedOrigin);
  if (target.origin !== trustedOrigin) throw new Error('read_only_audit_cookie_origin_invalid');
  const cookie = (await context.cookies(trustedOrigin)).find((entry) => entry.name === PORTAL_AUDIT_TOKEN_COOKIE_NAME);
  if (!cookie) throw new Error('read_only_audit_cookie_missing_in_browser');
  if (cookie.path !== '/' || cookie.sameSite !== 'Strict' || cookie.httpOnly !== true) {
    throw new Error('read_only_audit_cookie_transport_invalid');
  }
}

/**
 * The deployment must mint `data-portal-read-only-audit` after an authenticated
 * request that already carries the cookie. Missing that attribute means the
 * target does not hold a matching PORTAL_AUDIT_READ_ONLY_TOKEN.
 */
export async function assertDeploymentAcceptedReadOnlyAudit(page) {
  if (await page.locator('[data-portal-read-only-audit="1"]').count() === 0) {
    throw new Error('read_only_audit_capability_rejected_by_deployment');
  }
}

/** Role storage state may be copied in memory, but must not carry the secret. */
export function stripReadOnlyAuditCookieFromStorageState(storageState) {
  return {
    ...storageState,
    cookies: storageState.cookies.filter((cookie) => cookie.name !== PORTAL_AUDIT_TOKEN_COOKIE_NAME),
  };
}
