import { NextResponse } from 'next/server';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { logger } from '@/lib/observability/logger';
import { checkCspReportRateLimit } from '@/lib/security/cspReportRateLimit';
import {
  CSP_REPORT_MAX_BYTES,
  countCspViolations,
  extractCspViolations,
  parseCspReportContentType,
} from '@/lib/security/cspReport';
import { persistCspViolationCounts } from '@/lib/security/cspViolationStore';

/**
 * POST /api/csp-report — browser CSP violation sink (WAP-36 phase 1).
 *
 * Target of the `report-uri` / `report-to` directives that `middleware.ts`
 * adds to the `Content-Security-Policy-Report-Only` header. Browsers post
 * here without credentials or a session; the route therefore:
 *  - accepts only `application/csp-report` (legacy) and
 *    `application/reports+json` (Reporting API) — anything else is 415;
 *  - refuses bodies over 16 KB (413) before reading them when the client
 *    declares a length, and after reading otherwise;
 *  - rate-limits per proxy-trusted IP (429), fail-open without Upstash like
 *    the other public sinks (see `lib/security/cspReportRateLimit.ts`);
 *  - logs ONE structured `csp.violation` line per distinct
 *    (directive, blocked host, document path, disposition) with a `count`.
 *    No query strings, no script samples, no source files, no user ids —
 *    see the privacy contract in `lib/security/cspReport.ts`;
 *  - (phase 2 prep) increments the hourly aggregate in `csp_violation_buckets`
 *    for the same counted rows — one upsert per distinct key per batch, in one
 *    transaction (`lib/security/cspViolationStore.ts`). Only the redacted
 *    summary is stored, never the report body, IP or user agent. A database
 *    error is logged and swallowed: the sink still answers 204;
 *  - answers 204 so the browser drops the beacon.
 *
 * Reading the soak: `/admin/csp-report` (super admins) shows the stored
 * aggregates for the last 24h / 7d; the log stream still carries one
 * `message: "csp.violation"` line per distinct row per batch. Details in
 * `docs/SECURITY-HARDENING.md` §13.
 */
export async function POST(request: Request) {
  const contentType = parseCspReportContentType(request.headers.get('content-type'));
  if (!contentType) {
    return new NextResponse(null, { status: 415 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > CSP_REPORT_MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const ip = getClientIpFromRequest(request);
  const { success: rateOk } = await checkCspReportRateLimit(ip);
  if (!rateOk) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': '60' } });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (new TextEncoder().encode(text).byteLength > CSP_REPORT_MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const violations = extractCspViolations(contentType, payload);
  const counted = countCspViolations(violations);
  for (const row of counted) {
    logger.info('csp.violation', {
      directive: row.directive,
      blockedHost: row.blockedHost,
      documentPath: row.documentPath,
      disposition: row.disposition,
      count: row.count,
      format: contentType,
    });
  }
  if (counted.length > 0) {
    // Fail-soft by contract: persistCspViolationCounts never throws.
    await persistCspViolationCounts(counted);
  }

  return new NextResponse(null, { status: 204 });
}

/** The sink is write-only; browsers never GET it. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
