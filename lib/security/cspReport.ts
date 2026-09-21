/**
 * Normalization for CSP violation reports posted to `/api/csp-report`.
 *
 * Pure functions, no I/O. The route accepts two wire formats:
 *  - legacy `report-uri`: `application/csp-report`, one `{ "csp-report": {...} }`
 *  - Reporting API v1 `report-to`: `application/reports+json`, an array of
 *    `{ type: "csp-violation", url, body: {...} }`
 *
 * Privacy contract (WAP-36 phase 1): the sink logs aggregate-friendly facts
 * only — the blocked resource's HOST (or CSP keyword such as `inline`), the
 * violated directive, the document PATH, and the disposition. Never the
 * query string, fragment, `script-sample`, `source-file`, cookies, or any
 * user identifier. Everything is length-capped so a hostile report cannot
 * bloat the log stream.
 */

export const CSP_REPORT_MAX_BYTES = 16 * 1024;
export const CSP_REPORT_MAX_VIOLATIONS_PER_BATCH = 20;
/** Hard cap on a stored document path (characters, no ellipsis). */
export const CSP_REPORT_MAX_PATH_LENGTH = 200;
/** RFC 1035 §2.3.4: a full hostname is at most 253 characters. */
export const CSP_REPORT_MAX_HOST_LENGTH = 253;
/**
 * Ceiling on distinct `csp_violation_buckets` rows per hour bucket. Every
 * stored column is an allowlisted or shape-checked value, but the document
 * path still has attacker-chosen static segments, so one client could mint
 * new keys on purpose; above this ceiling the sink keeps incrementing
 * existing rows and stops creating new ones (lib/security/cspViolationStore.ts).
 * A real soak on this site is a few dozen distinct keys per hour.
 */
export const CSP_VIOLATION_MAX_BUCKETS_PER_HOUR = 2000;

/**
 * Directive names the sink stores verbatim (CSP Level 3 plus the legacy
 * `report-uri`/`block-all-mixed-content`). Anything else a client sends —
 * a typo, markup, a 300-character token — is stored as `other` so the
 * directive column can never carry attacker-chosen text.
 */
export const CSP_DIRECTIVE_ALLOWLIST: ReadonlySet<string> = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'frame-ancestors',
  'media-src',
  'object-src',
  'worker-src',
  'manifest-src',
  'base-uri',
  'form-action',
  'child-src',
  'prefetch-src',
  'require-trusted-types-for',
  'trusted-types',
  'upgrade-insecure-requests',
  'block-all-mixed-content',
  'sandbox',
  'report-uri',
  'report-to',
]);
export const CSP_DIRECTIVE_OTHER = 'other';

/** Bare URL schemes browsers report as a "blocked URI" for extension-injected scripts (host is always empty). */
const BLOCKED_SCHEME_ALLOWLIST: ReadonlySet<string> = new Set([
  'chrome-extension',
  'moz-extension',
  'safari-web-extension',
  'ms-browser-extension',
]);
export const CSP_BLOCKED_HOST_INVALID = 'invalid';
/** Schemes whose authority component is a network host worth storing. */
const NETWORK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'ws', 'wss', 'ftp']);

export const CSP_REPORT_CONTENT_TYPES = ['application/csp-report', 'application/reports+json'] as const;
export type CspReportContentType = (typeof CSP_REPORT_CONTENT_TYPES)[number];

export interface CspViolationSummary {
  /** Host of the blocked resource, or the CSP keyword (`inline`, `eval`, `data`, `blob`, `self`). */
  blockedHost: string;
  /** Effective directive when present, else the violated directive. */
  directive: string;
  /** Path (no query, no fragment, dynamic segments as `:id`) of the page that produced the report. */
  documentPath: string;
  disposition: 'report' | 'enforce' | 'unknown';
}

export interface CspViolationCount extends CspViolationSummary {
  count: number;
}

/** Strip parameters (`; charset=utf-8`) and match the two accepted media types. */
export function parseCspReportContentType(header: string | null): CspReportContentType | null {
  if (!header) return null;
  const mediaType = header.split(';')[0]?.trim().toLowerCase();
  return (CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(mediaType ?? '')
    ? (mediaType as CspReportContentType)
    : null;
}

/** Hard cap with no ellipsis, so a capped value is still a plain path prefix. */
function capPath(value: string): string {
  return value.length > CSP_REPORT_MAX_PATH_LENGTH ? value.slice(0, CSP_REPORT_MAX_PATH_LENGTH) : value;
}

/**
 * RFC 1123 hostname (labels of letters, digits and hyphens, not starting or
 * ending with a hyphen, dot-separated, optional trailing dot), an IPv4
 * literal, or a bracketed IPv6 literal (`[::1]`) — each with an optional
 * `:port`. Exactly the shape `URL#host` yields for a real network origin.
 */
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_PATTERN = new RegExp(
  `^(?:${HOSTNAME_LABEL}(?:\\.${HOSTNAME_LABEL})*\\.?|\\[[0-9a-f:.]+\\])(?::\\d{1,5})?$`,
  'i',
);

/** True when `host` is a well-formed hostname / IP literal (with optional port) of at most 253 characters. */
export function isValidBlockedHost(host: string): boolean {
  return host.length > 0 && host.length <= CSP_REPORT_MAX_HOST_LENGTH && HOST_PATTERN.test(host);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const BLOCKED_KEYWORDS = new Set(['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval', 'trusted-types-sink', 'about']);

/**
 * Reduce a blocked URI to its host (or the CSP keyword). Never returns path or
 * query, and never free text: the result is a keyword from `BLOCKED_KEYWORDS`,
 * a scheme from the extension allowlist, a shape-checked hostname / IP literal
 * (`isValidBlockedHost`), `unknown` when absent, or `invalid`.
 */
export function summarizeBlockedUri(blockedUri: unknown): string {
  const raw = asString(blockedUri);
  if (!raw) return 'unknown';
  const lowered = raw.trim().toLowerCase();
  if (BLOCKED_KEYWORDS.has(lowered)) return lowered;
  if (lowered.startsWith('data:')) return 'data';
  if (lowered.startsWith('blob:')) return 'blob';
  if (BLOCKED_SCHEME_ALLOWLIST.has(lowered)) return lowered;
  try {
    const url = new URL(raw);
    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    // Extension URLs carry a per-install id as their "host"; the scheme is the fact worth keeping.
    if (BLOCKED_SCHEME_ALLOWLIST.has(scheme)) return scheme;
    // Only network schemes have a host in the RFC 1123 sense.
    if (!NETWORK_SCHEMES.has(scheme)) return CSP_BLOCKED_HOST_INVALID;
    const host = url.host.toLowerCase();
    return isValidBlockedHost(host) ? host : CSP_BLOCKED_HOST_INVALID;
  } catch {
    return CSP_BLOCKED_HOST_INVALID;
  }
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
/**
 * Opaque identifiers (cuid, hex digests, base64 without `-`/`_`): alphanumeric
 * only, at least one digit, 16+ chars. Slugs (`google-it-support`) carry
 * hyphens or no digits, locale prefixes are short, so both survive.
 */
const OPAQUE_SEGMENT = /^(?=.*\d)[a-z0-9]{16,}$/i;
/** Route segments whose next segment is always a token or id, whatever it looks like. */
// `unmatched`: /admin/coursera/learners/unmatched/[externalEmail] — a percent-encoded email.
const TOKEN_PARENT_SEGMENTS = new Set(['q', 'r', 'consent', 'placement', 'invite', 'verify', 'reset-password', 'unsubscribe', 'token', 'unmatched']);

/** A segment carrying an email address, raw or percent-encoded, wherever it sits in the path. */
const EMAIL_SEGMENT = /@|%40/i;

/**
 * Replace dynamic segments (`/admin/members/<uuid>`, `/q/<token>`, `/jobs/123`,
 * anything containing `@` / `%40`) with `:id` so the path groups per route and
 * never carries a token or an address. The static segments before and after
 * are kept.
 */
export function collapseDynamicPathSegments(pathname: string): string {
  const segments = pathname.split('/');
  let previous = '';
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.length === 0) continue;
    const dynamic =
      TOKEN_PARENT_SEGMENTS.has(previous.toLowerCase()) ||
      UUID_SEGMENT.test(segment) ||
      NUMERIC_SEGMENT.test(segment) ||
      OPAQUE_SEGMENT.test(segment) ||
      EMAIL_SEGMENT.test(segment);
    previous = segment;
    if (dynamic) segments[i] = ':id';
  }
  return segments.join('/');
}

/**
 * Path component only — the query string can carry tokens, emails, redirect
 * targets — with dynamic segments collapsed to `:id` (see
 * `collapseDynamicPathSegments`) so path tokens never reach the log either,
 * hard-capped at CSP_REPORT_MAX_PATH_LENGTH characters.
 */
export function summarizeDocumentUri(documentUri: unknown): string {
  const raw = asString(documentUri);
  if (!raw) return '/unknown';
  try {
    const url = new URL(raw);
    return capPath(collapseDynamicPathSegments(url.pathname || '/'));
  } catch {
    return '/unknown';
  }
}

function summarizeDisposition(value: unknown): CspViolationSummary['disposition'] {
  return value === 'report' || value === 'enforce' ? value : 'unknown';
}

/** Allowlisted directive name, `unknown` when absent, `other` for anything not in CSP_DIRECTIVE_ALLOWLIST. */
export function summarizeDirective(effective: unknown, violated: unknown): string {
  const raw = asString(effective) ?? asString(violated);
  if (!raw) return 'unknown';
  // `violated-directive` may carry the whole source list; keep the name only.
  const name = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return CSP_DIRECTIVE_ALLOWLIST.has(name) ? name : CSP_DIRECTIVE_OTHER;
}

function fromLegacyReport(body: Record<string, unknown>): CspViolationSummary {
  return {
    blockedHost: summarizeBlockedUri(body['blocked-uri']),
    directive: summarizeDirective(body['effective-directive'], body['violated-directive']),
    documentPath: summarizeDocumentUri(body['document-uri']),
    disposition: summarizeDisposition(body['disposition']),
  };
}

function fromReportingApiBody(url: unknown, body: Record<string, unknown>): CspViolationSummary {
  return {
    blockedHost: summarizeBlockedUri(body['blockedURL'] ?? body['blocked-uri']),
    directive: summarizeDirective(body['effectiveDirective'] ?? body['effective-directive'], body['violatedDirective']),
    documentPath: summarizeDocumentUri(body['documentURL'] ?? body['document-uri'] ?? url),
    disposition: summarizeDisposition(body['disposition']),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse an already-JSON-decoded payload into summaries. Unknown shapes yield
 * an empty list (the route still answers 204 — a beacon sink must not teach
 * a probing client anything about its parser).
 */
export function extractCspViolations(contentType: CspReportContentType, payload: unknown): CspViolationSummary[] {
  const out: CspViolationSummary[] = [];
  if (contentType === 'application/csp-report') {
    if (isRecord(payload) && isRecord(payload['csp-report'])) out.push(fromLegacyReport(payload['csp-report']));
    return out;
  }
  const reports = Array.isArray(payload) ? payload : isRecord(payload) ? [payload] : [];
  for (const report of reports) {
    if (out.length >= CSP_REPORT_MAX_VIOLATIONS_PER_BATCH) break;
    if (!isRecord(report)) continue;
    if (report['type'] !== undefined && report['type'] !== 'csp-violation') continue;
    if (!isRecord(report['body'])) continue;
    out.push(fromReportingApiBody(report['url'], report['body']));
  }
  return out;
}

/** Collapse a batch into `{ ...summary, count }` rows keyed on the four summary fields. */
export function countCspViolations(violations: readonly CspViolationSummary[]): CspViolationCount[] {
  const counts = new Map<string, CspViolationCount>();
  for (const violation of violations) {
    const key = `${violation.directive}|${violation.blockedHost}|${violation.documentPath}|${violation.disposition}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { ...violation, count: 1 });
  }
  return Array.from(counts.values());
}
