// @vitest-environment node
// Real middleware; only the auth provider, database and logger are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
  getUser: async () => ({ data: { user: null }, error: null }),
  getSession: async () => ({ data: { session: null }, error: null }),
  mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: null, error: null }) },
} }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { CSP_REPORT_PATH } from '@/lib/security/csp';

const NEXT_NONCE_SOURCE = /'nonce-([A-Za-z0-9+/_-]+={0,2})'/;

function documentRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://www.workforceap.org${path}`, {
    headers: { host: 'www.workforceap.org', accept: 'text/html', 'sec-fetch-dest': 'document', ...headers },
  });
}

function reportOnly(response: Response) {
  return response.headers.get('content-security-policy-report-only');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0');
});
afterEach(() => vi.unstubAllEnvs());

describe('WAP-36 phase 1: middleware Content-Security-Policy-Report-Only', () => {
  it('sets a Report-Only policy carrying the same nonce it forwards to the app on x-nonce', async () => {
    const response = await middleware(documentRequest('/en/login'));
    const policy = reportOnly(response);
    expect(policy).toBeTruthy();
    const nonce = policy!.match(NEXT_NONCE_SOURCE)?.[1];
    expect(nonce).toBeTruthy();
    // NextResponse.next() exposes the forwarded request headers as x-middleware-request-*.
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).toBe(policy);

    const scriptSrc = policy!.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(policy).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(policy).toContain('report-to csp-endpoint');
    expect(response.headers.get('reporting-endpoints')).toBe(`csp-endpoint="${CSP_REPORT_PATH}"`);
    // Phase 1 never sets the enforcing header from middleware; next.config.ts owns it.
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it('mints a different nonce for every document request', async () => {
    const [a, b] = await Promise.all([middleware(documentRequest('/en')), middleware(documentRequest('/en'))]);
    const nonceA = reportOnly(a)!.match(NEXT_NONCE_SOURCE)![1];
    const nonceB = reportOnly(b)!.match(NEXT_NONCE_SOURCE)![1];
    expect(nonceA).not.toBe(nonceB);
  });

  it('drops a client-supplied x-nonce instead of forwarding it', async () => {
    const response = await middleware(documentRequest('/en', { 'x-nonce': 'attacker-chosen-nonce-value' }));
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker-chosen-nonce-value');
    expect(reportOnly(response)).not.toContain('attacker-chosen-nonce-value');
  });

  it('drops a client-supplied Content-Security-Policy request header, which Next prefers when picking its script nonce', async () => {
    const response = await middleware(documentRequest('/en', {
      'content-security-policy': "script-src 'nonce-EVIL'",
      'content-security-policy-report-only': "script-src 'nonce-EVIL2'",
    }));
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBeNull();
    const forwarded = response.headers.get('x-middleware-override-headers') ?? '';
    expect(forwarded.split(',')).not.toContain('content-security-policy');
    const ours = reportOnly(response)!.match(NEXT_NONCE_SOURCE)![1];
    expect(ours).not.toBe('EVIL');
    expect(ours).not.toBe('EVIL2');
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(ours);
    expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).toContain(`'nonce-${ours}'`);
    expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).not.toContain('EVIL');
  });

  it('skips API calls, RSC payloads and static files', async () => {
    const api = await middleware(new NextRequest('https://www.workforceap.org/api/health', { headers: { host: 'www.workforceap.org' } }));
    expect(reportOnly(api)).toBeNull();
    expect(api.headers.get('x-middleware-request-x-nonce')).toBeNull();

    const rsc = await middleware(documentRequest('/en', { rsc: '1', 'sec-fetch-dest': 'empty' }));
    expect(reportOnly(rsc)).toBeNull();

    const asset = await middleware(new NextRequest('https://www.workforceap.org/sw.js', { headers: { host: 'www.workforceap.org' } }));
    expect(reportOnly(asset)).toBeNull();
  });

  it('keeps the header on the login redirect for a protected page', async () => {
    const response = await middleware(documentRequest('/dashboard'));
    expect(response.status).toBe(307);
    expect(reportOnly(response)).toMatch(NEXT_NONCE_SOURCE);
  });
});
