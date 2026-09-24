import { sanitizeAuditUrl } from './portal-audit-browser.mjs';

/**
 * Classify infrastructure diagnostics without weakening application failures.
 * This exact CSP error is emitted by Vercel's injected Preview toolbar, not by
 * WorkforceAP's scripts. It remains visible in the artifact as a count.
 */
export function isVercelPreviewToolbarCspError(message, { mode, trustedOrigin } = {}) {
  if (mode !== 'isolated_preview') return false;
  let origin;
  try {
    origin = new URL(trustedOrigin);
  } catch {
    return false;
  }
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.vercel.app')) return false;

  const normalized = String(message ?? '').replace(/\s+/g, ' ').trim();
  return /^Loading the script 'https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js' violates the following Content Security Policy directive: "script-src [^"]+"\. (?:Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback\. )?The action has been blocked\.$/.test(normalized);
}

/** Reduce Playwright's network error text to a bounded, non-sensitive code. */
export function requestFailureCategory(errorText) {
  const error = String(errorText ?? '');
  if (/\b(?:net::)?ERR_ABORTED\b/i.test(error)) return 'aborted';
  if (/\b(?:net::)?ERR_BLOCKED_BY_CLIENT\b/i.test(error)) return 'blocked_by_client';
  if (/\b(?:net::)?ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT)\b/i.test(error)) return 'timeout';
  if (/\b(?:net::)?ERR_(?:CONNECTION_RESET|CONNECTION_CLOSED)\b/i.test(error)) return 'connection_reset';
  if (/\b(?:net::)?ERR_(?:NAME_NOT_RESOLVED|DNS_PROBE_FINISHED_NXDOMAIN)\b/i.test(error)) return 'dns';
  if (/\b(?:net::)?ERR_(?:CERT_[A-Z_]+|SSL_[A-Z_]+)\b/i.test(error)) return 'tls';
  return error ? 'other_network_error' : 'unknown';
}

/** A canceled, read-only browser fetch can be diagnostic after the destination is verified. */
export function isAbortedReadRequest({ method, resourceType, category }) {
  return (
    (method === 'GET' || method === 'HEAD') &&
    (resourceType === 'fetch' || resourceType === 'xhr') &&
    category === 'aborted'
  );
}

/** Never let cancellation stand in for a completed, healthy portal destination. */
export function isVerifiedReadOnlyDestination({
  exactExpectedPath,
  sameOrigin,
  documentStatus,
  appReady,
  h1Count,
  readOnlyCapabilityActive,
  errorFallbackDetected,
  consoleErrorCount,
  pageErrorCount,
  otherFailureCount,
}) {
  return (
    exactExpectedPath === true &&
    sameOrigin === true &&
    Number.isInteger(documentStatus) &&
    documentStatus >= 200 &&
    documentStatus < 300 &&
    appReady === true &&
    h1Count === 1 &&
    readOnlyCapabilityActive === true &&
    errorFallbackDetected === false &&
    consoleErrorCount === 0 &&
    pageErrorCount === 0 &&
    otherFailureCount === 0
  );
}

const SAFE_REQUEST_ROOTS = new Set(['api', 'dashboard', 'admin', 'employer', 'partner', 'counselor', '_next']);

/** Persist only a coarse request area: API slugs can be short private IDs. */
export function sanitizedRequestPath(value, dynamicPatterns = []) {
  try {
    const segments = new URL(sanitizeAuditUrl(value, dynamicPatterns)).pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '/';
    const root = segments[0];
    if (!SAFE_REQUEST_ROOTS.has(root)) return '/[redacted]';
    return segments.length === 1 ? `/${root}` : `/${root}/[redacted]`;
  } catch {
    return '/[invalid-url]';
  }
}
