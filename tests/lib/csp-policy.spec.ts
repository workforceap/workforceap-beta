// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import {
  CSP_ENFORCED_DIRECTIVES,
  CSP_REPORT_PATH,
  buildCspReportOnlyPolicy,
  buildReportingEndpointsHeader,
  generateCspNonce,
  isCspNonceDocumentRequest,
  isValidCspNonce,
} from '@/lib/security/csp';
import {
  CSP_REPORT_MAX_BYTES,
  countCspViolations,
  extractCspViolations,
  parseCspReportContentType,
  summarizeBlockedUri,
  collapseDynamicPathSegments,
  summarizeDocumentUri,
} from '@/lib/security/cspReport';

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/** Next's own nonce regex (server/app-render/get-script-nonce-from-header). */
const NEXT_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

function directive(policy: string, name: string): string[] {
  const found = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(name));
  return found ? found.split(/\s+/) : [];
}

describe('WAP-36 phase 1: CSP nonce policy', () => {
  it('keeps the Report-Only directive list identical to the enforced next.config.ts header', async () => {
    const headers = (await nextConfig.headers?.()) as HeaderRule[];
    const rule = headers.find((entry) => entry.source === '/(.*)');
    const enforced = rule?.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
    expect(enforced).toBe(CSP_ENFORCED_DIRECTIVES.join('; '));
  });

  it('mints a fresh base64 nonce per call in the format Next.js re-applies to its scripts', () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(a).not.toBe(b);
    expect(isValidCspNonce(a)).toBe(true);
    expect(`'nonce-${a}'`).toMatch(NEXT_NONCE_SOURCE);
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
  });

  it('adds the nonce, strict-dynamic and both report directives without touching the other directives', () => {
    const nonce = generateCspNonce();
    const policy = buildCspReportOnlyPolicy(nonce);
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(directive(policy, 'report-uri')).toEqual(['report-uri', CSP_REPORT_PATH]);
    expect(directive(policy, 'report-to')).toEqual(['report-to', 'csp-endpoint']);
    expect(buildReportingEndpointsHeader()).toBe(`csp-endpoint="${CSP_REPORT_PATH}"`);
    // Browsers ignore upgrade-insecure-requests in a report-only policy and warn on it.
    expect(policy).not.toContain('upgrade-insecure-requests');
    for (const enforced of CSP_ENFORCED_DIRECTIVES) {
      if (enforced.startsWith('script-src') || enforced === 'upgrade-insecure-requests') continue;
      expect(policy.split('; ')).toContain(enforced);
    }
    expect(() => buildCspReportOnlyPolicy("x' 'unsafe-inline")).toThrow();
  });

  it('mints a nonce only for document navigations', () => {
    const req = (method: string, pathname: string, headers: Record<string, string> = {}) => ({
      method,
      nextUrl: { pathname },
      headers: new Headers(headers),
    });
    expect(isCspNonceDocumentRequest(req('GET', '/en/login'))).toBe(true);
    expect(isCspNonceDocumentRequest(req('GET', '/', { 'sec-fetch-dest': 'document' }))).toBe(true);
    expect(isCspNonceDocumentRequest(req('HEAD', '/en'))).toBe(true);
    expect(isCspNonceDocumentRequest(req('POST', '/en/login'))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/api/health'))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/_next/data/x.json'))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/sw.js'))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/manifest.json'))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/dashboard', { rsc: '1' }))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/dashboard', { 'next-router-prefetch': '1' }))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/dashboard', { 'sec-fetch-dest': 'empty' }))).toBe(false);
    expect(isCspNonceDocumentRequest(req('GET', '/dashboard', { 'sec-fetch-dest': 'script' }))).toBe(false);
  });
});

describe('WAP-36 phase 1: CSP report normalization', () => {
  it('accepts only the two browser media types, with parameters', () => {
    expect(parseCspReportContentType('application/csp-report')).toBe('application/csp-report');
    expect(parseCspReportContentType('application/reports+json; charset=utf-8')).toBe('application/reports+json');
    expect(parseCspReportContentType('application/json')).toBeNull();
    expect(parseCspReportContentType('text/plain')).toBeNull();
    expect(parseCspReportContentType(null)).toBeNull();
    expect(CSP_REPORT_MAX_BYTES).toBe(16 * 1024);
  });

  it('reduces URLs to host and path only — never query strings or fragments', () => {
    expect(summarizeBlockedUri('https://evil.example.com/x.js?token=secret#frag')).toBe('evil.example.com');
    expect(summarizeBlockedUri('inline')).toBe('inline');
    expect(summarizeBlockedUri('eval')).toBe('eval');
    expect(summarizeBlockedUri('data:text/javascript,alert(1)')).toBe('data');
    expect(summarizeBlockedUri('blob:https://www.workforceap.org/uuid')).toBe('blob');
    expect(summarizeBlockedUri(undefined)).toBe('unknown');
    expect(summarizeDocumentUri('https://www.workforceap.org/en/login?redirectTo=%2Fdashboard&email=a%40b.c')).toBe('/en/login');
    expect(summarizeDocumentUri('not a url')).toBe('/unknown');
  });

  it('collapses dynamic document path segments to :id so ids and tokens never reach the log', () => {
    // UUID and numeric ids anywhere in the path; the static route segments around them stay.
    expect(summarizeDocumentUri('https://www.workforceap.org/admin/members/3f2c1d8e-9a4b-4c7d-8e1f-0a2b3c4d5e6f/notes')).toBe('/admin/members/:id/notes');
    expect(summarizeDocumentUri('https://www.workforceap.org/en/dashboard/jobs/48213?utm=x')).toBe('/en/dashboard/jobs/:id');
    // Token routes redact whatever follows the known prefix, even a short or slug-looking token.
    expect(summarizeDocumentUri('https://www.workforceap.org/q/kx7-abc?sig=1')).toBe('/q/:id');
    expect(summarizeDocumentUri('https://www.workforceap.org/survey/placement/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0')).toBe('/survey/placement/:id');
    // Opaque cuid-style ids collapse; human slugs and locale prefixes do not.
    expect(collapseDynamicPathSegments('/counselor/students/clx9k2m4p0001abcd8f7e6g5h')).toBe('/counselor/students/:id');
    expect(collapseDynamicPathSegments('/en/programs/google-it-support-professional-certificate')).toBe('/en/programs/google-it-support-professional-certificate');
    expect(collapseDynamicPathSegments('/')).toBe('/');
  });

  it('normalizes the legacy report-uri body', () => {
    const rows = extractCspViolations('application/csp-report', {
      'csp-report': {
        'document-uri': 'https://www.workforceap.org/dashboard?utm_source=x',
        'violated-directive': "script-src 'self' 'nonce-abc'",
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://cdn.example.net/lib.js?sig=1',
        disposition: 'report',
        'script-sample': 'window.secret = "leak"',
        'source-file': 'https://www.workforceap.org/_next/static/chunks/app.js',
      },
    });
    expect(rows).toEqual([
      { blockedHost: 'cdn.example.net', directive: 'script-src-elem', documentPath: '/dashboard', disposition: 'report' },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/leak|utm_source|sig=1|source-file|chunks/);
  });

  it('normalizes the Reporting API batch, skips foreign report types and caps the batch', () => {
    const violation = {
      type: 'csp-violation',
      url: 'https://www.workforceap.org/en?lang=es',
      body: { documentURL: 'https://www.workforceap.org/en?lang=es', blockedURL: 'inline', effectiveDirective: 'script-src-elem', disposition: 'report' },
    };
    const rows = extractCspViolations('application/reports+json', [
      violation,
      violation,
      { type: 'deprecation', url: 'https://www.workforceap.org/en', body: { id: 'x' } },
      { ...violation, body: { ...violation.body, blockedURL: 'https://va.vercel-scripts.com/v1/script.js' } },
      ...Array.from({ length: 30 }, () => violation),
    ]);
    expect(rows).toHaveLength(20);
    expect(countCspViolations(rows)).toEqual([
      { blockedHost: 'inline', directive: 'script-src-elem', documentPath: '/en', disposition: 'report', count: 19 },
      { blockedHost: 'va.vercel-scripts.com', directive: 'script-src-elem', documentPath: '/en', disposition: 'report', count: 1 },
    ]);
    expect(extractCspViolations('application/reports+json', { nonsense: true })).toEqual([]);
    expect(extractCspViolations('application/csp-report', [])).toEqual([]);
  });
});
