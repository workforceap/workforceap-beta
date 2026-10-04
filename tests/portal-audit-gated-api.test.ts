import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { GATE_CODES } from '@/lib/billing/twoStage/dto';
import {
  classifyCollectedPortalAuditRow,
  trackSameOriginDataRequests,
} from '../scripts/lib/portal-audit-data-requests.mjs';
import {
  AUDITED_GATE_CODES,
  EXPECTED_GATE_CODES,
  GATED_API_STATUS,
  isExpectedGatedApiBody,
  isGatedApiResponseCandidate,
} from '../scripts/lib/portal-audit-gated-api.mjs';

const ORIGIN = 'https://preview.example.com';
const GATED_API = `${ORIGIN}/api/admin/members/11111111-2222-3333-4444-555555555555/billing/two-stage/cases`;
const OTHER_API = `${ORIGIN}/api/admin/members/11111111-2222-3333-4444-555555555555/overview`;

const gateBody = (code: string) => JSON.stringify({ code, message: `${code} message` });

const native503 = 'Failed to load resource: the server responded with a status of 503 ()';

class AuditPage extends EventEmitter {
  async waitForTimeout(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const requestFor = (url: string, resourceType = 'fetch', headers = {}, failure = '') => ({
  url: () => url,
  method: () => 'GET',
  resourceType: () => resourceType,
  headers: () => headers,
  failure: () => ({ errorText: failure }),
});
const consoleMessage = (text = native503, url = GATED_API, argumentCount = 0) => ({
  type: () => 'error', text: () => text, location: () => ({ url }),
  args: () => Array.from({ length: argumentCount }),
});
type DataResponse = {
  status: number; url: string; body: string | null | (() => Promise<string>); resourceType?: string;
};

function deliverResponse(page: AuditPage, response: DataResponse) {
  const request = requestFor(response.url, response.resourceType);
  page.emit('request', request);
  page.emit('response', {
    status: () => response.status, url: () => response.url, request: () => request,
    text: typeof response.body === 'function' ? response.body : async () => response.body,
  });
  page.emit('requestfinished', request);
}

async function collect(responses: readonly DataResponse[]) {
  const page = new AuditPage();
  const dataRequests = trackSameOriginDataRequests(page, { trustedOrigin: ORIGIN });
  for (const response of responses) {
    // Native Chromium can deliver console before the asynchronous body check.
    if (response.status === 503) dataRequests.recordConsoleError(consoleMessage(native503, response.url));
    deliverResponse(page, response);
  }
  await dataRequests.waitForSettlement(5);
  return { page, dataRequests };
}

function billingRouteInput() {
  return {
    path: '/admin/members/[id]/billing',
    finalUrl: `${ORIGIN}/admin/members/11111111-2222-3333-4444-555555555555/billing`,
    comparisonExpectedPath: '/admin/members/11111111-2222-3333-4444-555555555555/billing',
    comparisonFinalUrl: `${ORIGIN}/admin/members/11111111-2222-3333-4444-555555555555/billing`,
    title: 'Member billing', documentStatus: 200,
    bodyText: 'Two-stage billing is not available in this environment yet',
    appReady: true, h1Count: 1, readOnlyCapabilityActive: true,
  };
}

function classifyBillingRoute(dataRequests: ReturnType<typeof trackSameOriginDataRequests>) {
  return classifyCollectedPortalAuditRow(billingRouteInput(), dataRequests);
}

describe('portal audit gated two-stage billing responses', () => {
  it('collects a gated 503 and its native browser console before keeping the route passing', async () => {
    const responses = [{ status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') }];
    const { dataRequests } = await collect(responses);

    expect(dataRequests.errors).toEqual([]);
    expect(dataRequests.consoleErrors).toEqual([]);
    const result = classifyBillingRoute(dataRequests);
    expect(result.pageErrorCount).toBe(0);
    expect(result.failureReasons).not.toContain('page_errors');
    expect(result.ok).toBe(true);
  });

  it('still fails the route for a misconfiguration gate code', async () => {
    const { dataRequests } = await collect([
      { status: 503, url: GATED_API, body: gateBody('PROVIDER_ORG_MISCONFIGURED') },
    ]);

    expect(dataRequests.errors).toHaveLength(1);
    expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
  });

  it('still fails the route for an unknown 503 code', async () => {
    const { dataRequests } = await collect([
      { status: 503, url: GATED_API, body: gateBody('SOMETHING_ELSE_BROKE') },
    ]);

    expect(dataRequests.errors).toHaveLength(1);
    expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
  });

  it('still fails the route for other error statuses on the same path', async () => {
    for (const status of [400, 401, 403, 404, 500, 502]) {
      const { dataRequests } = await collect([
        { status, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') },
      ]);
      expect(dataRequests.errors, `HTTP ${status}`).toHaveLength(1);
      expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
    }
  });

  it('still fails an allowlisted code served from an unrelated path', async () => {
    for (const url of [OTHER_API, `${ORIGIN}/api/admin/members/abc/billing`, `${ORIGIN}/api/health`]) {
      const { dataRequests } = await collect([
        { status: 503, url, body: gateBody('MIGRATION_NOT_APPLIED') },
      ]);
      expect(dataRequests.errors, url).toHaveLength(1);
      expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
    }
  });

  it('still fails when the body is unreadable, empty or not JSON', async () => {
    for (const body of [null, '', '<html>503</html>', 'MIGRATION_NOT_APPLIED', '[]', '{"code":null}', '{}']) {
      const { dataRequests } = await collect([{ status: 503, url: GATED_API, body }]);
      expect(dataRequests.errors, JSON.stringify(body)).toHaveLength(1);
      expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
    }
  });

  it('keeps the actual verified destination and aborted RSC prefetch diagnostic', async () => {
    const { page, dataRequests } = await collect([
      { status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') },
    ]);
    const prefetch = requestFor(`${ORIGIN}/admin/members?_rsc=fixture`, 'fetch', {
      rsc: '1', 'next-router-prefetch': '1',
    }, 'net::ERR_ABORTED');
    page.emit('request', prefetch);
    page.emit('requestfailed', prefetch);

    const row = classifyBillingRoute(dataRequests);
    expect(row.ok).toBe(true);
    expect(row.abortedDataRequestCount).toBe(1);
    expect(row.abortedDataRequests).toEqual([
      { method: 'GET', path: '/admin/[redacted]', resourceType: 'fetch', prefetch: true, rsc: true },
    ]);
    expect(row.pageErrors).toEqual([]);
    const unhealthy = classifyCollectedPortalAuditRow({ ...billingRouteInput(), appReady: false }, dataRequests);
    expect(unhealthy.failureReasons).toContain('page_errors');
    expect(unhealthy.pageErrors[0]).toContain('failed (aborted)');
  });

  it('retains unrelated app errors and identical text emitted by application console.error', async () => {
    const { dataRequests } = await collect([
      { status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') },
    ]);
    dataRequests.recordConsoleError(consoleMessage('TypeError: billing UI crashed', GATED_API, 1));
    dataRequests.recordConsoleError(consoleMessage(native503, GATED_API, 1));
    expect(dataRequests.consoleErrors).toEqual(['TypeError: billing UI crashed', native503]);
    expect(classifyBillingRoute(dataRequests).failureReasons).toContain('console_errors');
  });

  it('requires exact resource location and caps exemptions before deduplicating', async () => {
    const { dataRequests } = await collect([
      { status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') },
    ]);
    for (const url of ['', `${GATED_API}?different=1`, OTHER_API, GATED_API.replace(ORIGIN, 'https://elsewhere.test')]) {
      dataRequests.recordConsoleError(consoleMessage(native503, url));
    }
    dataRequests.recordConsoleError(consoleMessage(native503, GATED_API));
    expect(dataRequests.consoleErrors).toHaveLength(5);
    expect(dataRequests.consoleErrors).toEqual(dataRequests.consoleErrors);
    expect(classifyBillingRoute(dataRequests).consoleErrorCount).toBe(1);
    expect(classifyBillingRoute(dataRequests).ok).toBe(false);
  });

  it('does not excuse a document or static resource 503 with an allowlisted body', async () => {
    for (const resourceType of ['document', 'script', 'image']) {
      const { dataRequests } = await collect([
        { status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED'), resourceType },
      ]);
      expect(dataRequests.consoleErrors, resourceType).toEqual([native503]);
      expect(classifyBillingRoute(dataRequests).ok).toBe(false);
    }
  });

  it('keeps mixed gate codes at one URL strict regardless of response order', async () => {
    const good = { status: 503, url: GATED_API, body: gateBody('MIGRATION_NOT_APPLIED') };
    const bad = { ...good, body: gateBody('PROVIDER_ORG_MISCONFIGURED') };
    for (const responses of [[good, bad], [bad, good]]) {
      const { dataRequests } = await collect(responses);
      expect(dataRequests.errors).toHaveLength(1);
      expect(dataRequests.consoleErrors).toHaveLength(2);
      expect(classifyBillingRoute(dataRequests).ok).toBe(false);
    }
    const { page, dataRequests } = await collect([good]);
    expect(dataRequests.consoleErrors).toEqual([]);
    deliverResponse(page, bad);
    await dataRequests.waitForSettlement(5);
    // Retained evidence is recomputed; a later failure revokes the exemption.
    expect(dataRequests.consoleErrors).toEqual([native503]);
  });

  it('fails an unreadable or hung body within the settlement deadline and ignores a late success', async () => {
    const unreadable = await collect([
      { status: 503, url: GATED_API, body: async () => { throw new Error('unreadable'); } },
    ]);
    expect(classifyBillingRoute(unreadable.dataRequests).failureReasons).toContain('page_errors');
    let finishBody: (body: string) => void = () => {};
    const body = new Promise<string>((resolve) => { finishBody = resolve; });
    const { page, dataRequests } = await collect([
      { status: 503, url: GATED_API, body: () => body },
    ]);
    expect(dataRequests.errors).toHaveLength(1);
    expect(dataRequests.consoleErrors).toEqual([native503]);
    finishBody(gateBody('MIGRATION_NOT_APPLIED'));
    await page.waitForTimeout(1);
    expect(dataRequests.errors).toHaveLength(1);
    expect(classifyBillingRoute(dataRequests).ok).toBe(false);
    dataRequests.detach();
    expect(page.listenerCount('response')).toBe(0);
    expect(page.listenerCount('requestfailed')).toBe(0);
  });

  it('fails a late response whose body is still unverified during final DOM classification', () => {
    const page = new AuditPage();
    const dataRequests = trackSameOriginDataRequests(page, { trustedOrigin: ORIGIN });
    // Arrives after the caller's settlement wait, without a console event yet.
    deliverResponse(page, { status: 503, url: GATED_API, body: () => new Promise<string>(() => {}) });
    expect(classifyBillingRoute(dataRequests).failureReasons).toContain('page_errors');
    expect(dataRequests.errors).toHaveLength(1);
    dataRequests.detach();
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
