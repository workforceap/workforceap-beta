import { describe, expect, it } from 'vitest';
import { GATE_CODES } from '@/lib/billing/twoStage/dto';
import { classifyPortalAuditRow } from '../scripts/lib/portal-audit-classify.mjs';
import {
  AUDITED_GATE_CODES,
  EXPECTED_GATE_CODES,
  GATED_API_STATUS,
  isExpectedGatedApiBody,
  isExpectedGatedApiResponse,
  isGatedApiResponseCandidate,
} from '../scripts/lib/portal-audit-gated-api.mjs';

const ORIGIN = 'https://preview.example.com';
const GATED_API = `${ORIGIN}/api/admin/members/11111111-2222-3333-4444-555555555555/billing/two-stage/cases`;
const OTHER_API = `${ORIGIN}/api/admin/members/11111111-2222-3333-4444-555555555555/overview`;

const gateBody = (code: string) => JSON.stringify({ code, message: `${code} message` });

/**
 * Mirrors the audit's response handler: a same-origin data response with
 * status >= 400 becomes a page error unless it is an expected gated answer.
 */
function pageErrorsFor(responses: readonly { status: number; url: string; body: string | null }[]): string[] {
  return responses
    .filter(({ status }) => status >= 400)
    .filter((response) => !isExpectedGatedApiResponse(response))
    .map(({ status, url }) => `Same-origin data request returned HTTP ${status} at ${url}`);
}

/** The audited admin billing route, with whatever data errors the page produced. */
function classifyBillingRoute(pageErrors: readonly string[]) {
  return classifyPortalAuditRow({
    path: '/admin/members/[id]/billing',
    finalUrl: `${ORIGIN}/admin/members/11111111-2222-3333-4444-555555555555/billing`,
    comparisonExpectedPath: '/admin/members/11111111-2222-3333-4444-555555555555/billing',
    comparisonFinalUrl: `${ORIGIN}/admin/members/11111111-2222-3333-4444-555555555555/billing`,
    title: 'Member billing',
    documentStatus: 200,
    consoleErrors: [],
    pageErrors: [...pageErrors],
    bodyText: 'Two-stage billing is not available in this environment yet',
    appReady: true,
    h1Count: 1,
    readOnlyCapabilityActive: true,
  });
}

describe('portal audit gated two-stage billing responses', () => {
  it('excuses a 503 gate code on the gated billing API and keeps the route passing', () => {
    const responses = [{ status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') }];
    const pageErrors = pageErrorsFor(responses);

    expect(pageErrors).toEqual([]);
    const result = classifyBillingRoute(pageErrors);
    expect(result.pageErrorCount).toBe(0);
    expect(result.failureReasons).not.toContain('page_errors');
    expect(result.ok).toBe(true);
  });

  it('still fails the route for a misconfiguration gate code', () => {
    const pageErrors = pageErrorsFor([
      { status: 503, url: GATED_API, body: gateBody('PROVIDER_ORG_MISCONFIGURED') },
    ]);

    expect(pageErrors).toHaveLength(1);
    expect(classifyBillingRoute(pageErrors).failureReasons).toContain('page_errors');
  });

  it('still fails the route for an unknown 503 code', () => {
    const pageErrors = pageErrorsFor([
      { status: 503, url: GATED_API, body: gateBody('SOMETHING_ELSE_BROKE') },
    ]);

    expect(pageErrors).toHaveLength(1);
    expect(classifyBillingRoute(pageErrors).failureReasons).toContain('page_errors');
  });

  it('still fails the route for other error statuses on the same path', () => {
    for (const status of [400, 404, 500, 502]) {
      const pageErrors = pageErrorsFor([
        { status, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') },
      ]);
      expect(pageErrors, `HTTP ${status}`).toHaveLength(1);
      expect(classifyBillingRoute(pageErrors).failureReasons).toContain('page_errors');
    }
  });

  it('still fails an allowlisted code served from an unrelated path', () => {
    for (const url of [OTHER_API, `${ORIGIN}/api/admin/members/abc/billing`, `${ORIGIN}/api/health`]) {
      const pageErrors = pageErrorsFor([
        { status: 503, url, body: gateBody('MIGRATION_NOT_APPLIED') },
      ]);
      expect(pageErrors, url).toHaveLength(1);
      expect(classifyBillingRoute(pageErrors).failureReasons).toContain('page_errors');
    }
  });

  it('still fails when the body is unreadable, empty or not JSON', () => {
    for (const body of [null, '', '<html>503</html>', 'MIGRATION_NOT_APPLIED', '[]', '{"code":null}', '{}']) {
      const pageErrors = pageErrorsFor([{ status: 503, url: GATED_API, body }]);
      expect(pageErrors, JSON.stringify(body)).toHaveLength(1);
      expect(classifyBillingRoute(pageErrors).failureReasons).toContain('page_errors');
    }
  });

  it('only reads bodies for 503 responses on the gated path', () => {
    expect(isGatedApiResponseCandidate({ status: 503, url: GATED_API })).toBe(true);
    expect(isGatedApiResponseCandidate({ status: 503, url: `${GATED_API}/case-1/payment` })).toBe(true);
    expect(isGatedApiResponseCandidate({ status: 500, url: GATED_API })).toBe(false);
    expect(isGatedApiResponseCandidate({ status: 503, url: OTHER_API })).toBe(false);
    expect(isGatedApiResponseCandidate({ status: 503, url: 'not a url' })).toBe(false);
  });

  it('accepts every allowlisted code and rejects every audited one', () => {
    for (const code of EXPECTED_GATE_CODES) {
      expect(isExpectedGatedApiBody(gateBody(code)), code).toBe(true);
    }
    for (const code of AUDITED_GATE_CODES) {
      expect(isExpectedGatedApiBody(gateBody(code)), code).toBe(false);
    }
  });

  it('classifies every gate code the billing gates can emit', () => {
    // Source of truth: lib/billing/twoStage/dto.ts. A new gate code must be
    // deliberately allowlisted or left audited; it may never be both.
    const classified = [...EXPECTED_GATE_CODES, ...AUDITED_GATE_CODES].sort();
    expect(classified).toEqual([...GATE_CODES].sort());
    expect(new Set(classified).size).toBe(classified.length);
    expect(GATED_API_STATUS).toBe(503);
  });
});
