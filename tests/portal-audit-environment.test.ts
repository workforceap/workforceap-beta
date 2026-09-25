import { describe, expect, it } from 'vitest';
import { classifyPortalAuditRow } from '../scripts/lib/portal-audit-classify.mjs';
import {
  isAbortedReadRequest,
  isVerifiedReadOnlyDestination,
  isVercelPreviewToolbarCspError,
  requestFailureCategory,
  safeToolbarNavigationHeaders,
  sanitizedRequestPath,
} from '../scripts/lib/portal-audit-environment.mjs';

const preview = {
  mode: 'isolated_preview',
  trustedOrigin: 'https://workforceap-beta-git-preview-example.vercel.app',
};
const toolbarCspError =
  "Loading the script 'https://vercel.live/_next-live/feedback/feedback.js' violates the following Content Security Policy directive: \"script-src 'self' https://va.vercel-scripts.com/\". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.";

describe('toolbar navigation header boundary', () => {
  it('preserves safe document headers without forwarding cookie or bearer secrets', () => {
    expect(safeToolbarNavigationHeaders({
      Accept: 'text/html',
      'Accept-Language': 'en-US',
      Authorization: 'Bearer dummy',
      Cookie: 'private=dummy',
      'X-Private-Key': 'dummy',
      'Sec-Fetch-Site': 'same-origin',
    })).toEqual({ accept: 'text/html', 'accept-language': 'en-US' });
  });
});

function healthyRow(consoleErrors: string[]) {
  return classifyPortalAuditRow({
    role: 'member',
    viewport: 'desktop',
    path: '/dashboard',
    finalUrl: `${preview.trustedOrigin}/dashboard`,
    documentStatus: 200,
    title: 'Member dashboard',
    bodyText: 'Welcome to the member dashboard.',
    appReady: true,
    h1Count: 1,
    readOnlyCapabilityActive: true,
    consoleErrors,
    pageErrors: [],
  });
}

describe('Vercel Preview toolbar environmental diagnostic', () => {
  it('isolates the exact injected feedback.js CSP error while retaining app console failures', () => {
    expect(isVercelPreviewToolbarCspError(toolbarCspError, preview)).toBe(true);
    expect(healthyRow([]).ok).toBe(true);
    expect(healthyRow(['TypeError: app crashed']).failureReasons).toContain('console_errors');
  });

  it('does not suppress nearby CSP errors or the same text outside a trusted Vercel Preview', () => {
    const nearby = toolbarCspError.replace('feedback.js', 'other.js');
    expect(isVercelPreviewToolbarCspError(nearby, preview)).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError.replace('script-src', 'style-src'), preview)).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError, { ...preview, mode: 'production_canary' })).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError, { ...preview, mode: 'local' })).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError, { ...preview, trustedOrigin: 'https://preview.example.com' })).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError, { ...preview, trustedOrigin: 'http://preview.vercel.app' })).toBe(false);
    expect(isVercelPreviewToolbarCspError(toolbarCspError, { ...preview, trustedOrigin: 'invalid' })).toBe(false);
  });
});

describe('same-origin request failure category', () => {
  it('distinguishes navigation aborts from blocked, timed-out, and reset requests', () => {
    expect(requestFailureCategory('net::ERR_ABORTED')).toBe('aborted');
    expect(requestFailureCategory('net::ERR_BLOCKED_BY_CLIENT.Inspector')).toBe('blocked_by_client');
    expect(requestFailureCategory('net::ERR_TIMED_OUT')).toBe('timeout');
    expect(requestFailureCategory('net::ERR_CONNECTION_RESET')).toBe('connection_reset');
  });

  it('does not persist arbitrary error text or identifiers', () => {
    expect(requestFailureCategory('request failed for alice@example.com with secret=123')).toBe('other_network_error');
    expect(requestFailureCategory(undefined)).toBe('unknown');
  });
});

describe('aborted read-request diagnostics', () => {
  it('separates only canceled GET/HEAD fetches from fatal network failures', () => {
    expect(isAbortedReadRequest({ method: 'GET', resourceType: 'fetch', category: 'aborted' })).toBe(true);
    expect(isAbortedReadRequest({ method: 'HEAD', resourceType: 'xhr', category: 'aborted' })).toBe(true);
    expect(isAbortedReadRequest({ method: 'POST', resourceType: 'fetch', category: 'aborted' })).toBe(false);
    expect(isAbortedReadRequest({ method: 'GET', resourceType: 'document', category: 'aborted' })).toBe(false);
    expect(isAbortedReadRequest({ method: 'GET', resourceType: 'fetch', category: 'timeout' })).toBe(false);
    expect(isAbortedReadRequest({ method: 'GET', resourceType: 'fetch', category: 'connection_reset' })).toBe(false);
  });

  it('requires a completed healthy destination before a cancellation can be nonfatal', () => {
    const healthy = {
      exactExpectedPath: true,
      sameOrigin: true,
      documentStatus: 200,
      appReady: true,
      h1Count: 1,
      readOnlyCapabilityActive: true,
      errorFallbackDetected: false,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      otherFailureCount: 0,
    };
    expect(isVerifiedReadOnlyDestination(healthy)).toBe(true);
    for (const override of [
      { exactExpectedPath: false },
      { sameOrigin: false },
      { documentStatus: null },
      { documentStatus: 302 },
      { documentStatus: 500 },
      { appReady: false },
      { h1Count: 0 },
      { h1Count: 2 },
      { readOnlyCapabilityActive: false },
      { errorFallbackDetected: true },
      { consoleErrorCount: 1 },
      { pageErrorCount: 1 },
      { otherFailureCount: 1 },
    ]) {
      expect(isVerifiedReadOnlyDestination({ ...healthy, ...override })).toBe(false);
    }
  });

  it('keeps blocked-request evidence to a redacted path without host or query', () => {
    expect(
      sanitizedRequestPath(
        'https://preview.example.test/dashboard/jobs/member-private?token=secret',
        ['/dashboard/jobs/[id]'],
      ),
    ).toBe('/dashboard/[redacted]');
    expect(
      sanitizedRequestPath(
        'https://preview.example.test/api/readiness/550e8400-e29b-41d4-a716-446655440000?code=private',
      ),
    ).toBe('/api/[redacted]');
    expect(
      sanitizedRequestPath('https://preview.example.test/api/applications/acme-42?token=secret'),
    ).toBe('/api/[redacted]');
    expect(
      sanitizedRequestPath('https://preview.example.test/acme-42/private?token=secret'),
    ).toBe('/[redacted]');
    expect(sanitizedRequestPath('invalid URL')).toBe('/[invalid-url]');
  });
});
