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
const MAX_FIELD_LENGTH = 200;

export const CSP_REPORT_CONTENT_TYPES = ['application/csp-report', 'application/reports+json'] as const;
export type CspReportContentType = (typeof CSP_REPORT_CONTENT_TYPES)[number];

export interface CspViolationSummary {
  /** Host of the blocked resource, or the CSP keyword (`inline`, `eval`, `data`, `blob`, `self`). */
  blockedHost: string;
  /** Effective directive when present, else the violated directive. */
  directive: string;
  /** Path (no query, no fragment) of the page that produced the report. */
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

function clip(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const BLOCKED_KEYWORDS = new Set(['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval', 'trusted-types-sink', 'about']);

/** Reduce a blocked URI to its host (or the CSP keyword). Never returns path or query. */
export function summarizeBlockedUri(blockedUri: unknown): string {
  const raw = asString(blockedUri);
  if (!raw) return 'unknown';
  const lowered = raw.trim().toLowerCase();
  if (BLOCKED_KEYWORDS.has(lowered)) return lowered;
  if (lowered.startsWith('data:')) return 'data';
  if (lowered.startsWith('blob:')) return 'blob';
  try {
    const url = new URL(raw);
    return clip(url.host || url.protocol.replace(/:$/, '') || 'unknown');
  } catch {
    // Some browsers send a bare scheme (`chrome-extension`) or an opaque token.
    return clip(lowered.replace(/[^a-z0-9.:-]/g, '').slice(0, 64) || 'invalid');
  }
}

/** Path component only — the query string can carry tokens, emails, redirect targets. */
export function summarizeDocumentUri(documentUri: unknown): string {
  const raw = asString(documentUri);
  if (!raw) return '/unknown';
  try {
    const url = new URL(raw);
    return clip(url.pathname || '/');
  } catch {
    return '/unknown';
  }
}

function summarizeDisposition(value: unknown): CspViolationSummary['disposition'] {
  return value === 'report' || value === 'enforce' ? value : 'unknown';
}

function summarizeDirective(effective: unknown, violated: unknown): string {
  const raw = asString(effective) ?? asString(violated);
  if (!raw) return 'unknown';
  // `violated-directive` may carry the whole source list; keep the name only.
  return clip(raw.trim().split(/\s+/)[0]?.toLowerCase() ?? 'unknown');
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
