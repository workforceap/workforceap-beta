/**
 * Content-Security-Policy nonce plumbing (WAP-36, phase 1: observe only).
 *
 * Edge-safe: imported by `middleware.ts`, so nothing here may touch Node-only
 * APIs, Prisma, or the logger.
 *
 * Phase 1 leaves the ENFORCED header in `next.config.ts` untouched and adds a
 * second, `Content-Security-Policy-Report-Only` header built from the same
 * directive list plus `'nonce-<value>' 'strict-dynamic'` on `script-src` and a
 * report sink. Browsers evaluate both: the enforced one decides what runs, the
 * report-only one only files violation reports at `/api/csp-report`. Once the
 * soak shows no unexpected violations the enforce flip (phase 2) is a
 * one-line change in `middleware.ts` plus removal of the static header.
 *
 * `CSP_ENFORCED_DIRECTIVES` is a verbatim copy of the `next.config.ts`
 * `Content-Security-Policy` value; `tests/lib/csp-policy.spec.ts` asserts the
 * two never drift. It lives here because middleware runs in the Edge runtime
 * and cannot import `next.config.ts`.
 */

/** Forwarded request header carrying the per-request nonce for server components. */
export const CSP_NONCE_HEADER = 'x-nonce';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
/** Reporting API v1 endpoint registration (`report-to` needs it; `report-uri` does not). */
export const CSP_REPORTING_ENDPOINTS_HEADER = 'Reporting-Endpoints';
export const CSP_REPORT_ENDPOINT_NAME = 'csp-endpoint';
export const CSP_REPORT_PATH = '/api/csp-report';

/** Verbatim copy of the enforced policy in `next.config.ts` (parity-tested). */
export const CSP_ENFORCED_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.googletagmanager.com https://va.vercel-insights.com https://va.vercel-scripts.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.zippopotam.us https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://va.vercel-insights.com https://vitals.vercel-insights.com https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://api.elevenlabs.io wss://api.elevenlabs.io https://livekit.rtc.elevenlabs.io wss://livekit.rtc.elevenlabs.io wss://*.livekit.cloud wss://*.elevenlabs.io https://*.elevenlabs.io",
  "img-src 'self' data: blob: https://*.supabase.co https://*.public.blob.vercel-storage.com https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com https://api.dicebear.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com",
  "form-action 'self' https://formspree.io",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

/** Matches Next's own `getScriptNonceFromHeader` source regex. */
const NONCE_VALUE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * 128 bits of randomness, base64 — the format Next.js extracts from the CSP
 * header and re-applies to its own bootstrap `<script>` tags.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function isValidCspNonce(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128 && NONCE_VALUE_PATTERN.test(value);
}

/**
 * Report-Only variant of the enforced policy.
 *
 * - `script-src` gains `'nonce-<nonce>' 'strict-dynamic'`. Under CSP3 the
 *   presence of `'strict-dynamic'` makes browsers IGNORE `'unsafe-inline'`
 *   and the host allow-list for scripts, which is exactly what phase 1 must
 *   observe: every script that would break under a nonce-only policy shows
 *   up as a report while the enforced header keeps the page working.
 * - `upgrade-insecure-requests` is dropped: browsers ignore it in a
 *   report-only policy and log a console warning for it on every page.
 * - `report-uri` (legacy, `application/csp-report`) and `report-to`
 *   (Reporting API, `application/reports+json`) both point at the sink; a
 *   browser that understands `report-to` ignores `report-uri`.
 */
export function buildCspReportOnlyPolicy(nonce: string): string {
  if (!isValidCspNonce(nonce)) throw new Error('buildCspReportOnlyPolicy: invalid nonce');
  const directives = CSP_ENFORCED_DIRECTIVES.filter((directive) => directive !== 'upgrade-insecure-requests').map(
    (directive) => {
      if (!directive.startsWith('script-src ')) return directive;
      return directive.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    },
  );
  directives.push(`report-uri ${CSP_REPORT_PATH}`);
  directives.push(`report-to ${CSP_REPORT_ENDPOINT_NAME}`);
  return directives.join('; ');
}

/** `Reporting-Endpoints: csp-endpoint="/api/csp-report"` (Reporting API v1). */
export function buildReportingEndpointsHeader(): string {
  return `${CSP_REPORT_ENDPOINT_NAME}="${CSP_REPORT_PATH}"`;
}

/** The parts of a request the document check needs; `NextRequest` satisfies it. */
export interface CspRequestLike {
  method: string;
  nextUrl: { pathname: string };
  headers: { get(name: string): string | null; has(name: string): boolean };
}

/**
 * True only for HTML document navigations. The nonce is minted per document,
 * never for API calls, RSC/prefetch payloads, static files that slip past the
 * matcher (`/sw.js`, `/manifest.json`, `/robots.txt`), or non-GET methods.
 * Curl-style probes without `sec-fetch-dest` count as documents so ops can
 * verify the header with `curl -I`.
 */
export function isCspNonceDocumentRequest(request: CspRequestLike): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return false;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return false;
  if (request.headers.get('rsc') === '1') return false;
  if (request.headers.has('next-router-prefetch') || request.headers.has('next-router-state-tree')) return false;
  const destination = request.headers.get('sec-fetch-dest');
  if (destination && destination !== 'document' && destination !== 'iframe' && destination !== 'frame') return false;
  return true;
}
