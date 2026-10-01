// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn(), assurance: vi.fn(), trust: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
  getUser: mocks.user, getSession: mocks.session, mfa: { getAuthenticatorAssuranceLevel: mocks.assurance },
} }) }));
vi.mock('@/lib/auth/mfaTrust', () => ({ getAdminMfaTrustCookieName: () => 'wa_admin_mfa_trust', verifyAdminMfaTrustToken: mocks.trust }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const base = '/api/enrollment-agreements';
const request = (suffix: string, method = 'GET') => new NextRequest(`https://www.workforceap.org${base}${suffix}`, {
  method, headers: { host: 'www.workforceap.org' },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '1');
  mocks.user.mockResolvedValue({ data: { user: { id: 'synthetic-member-or-staff' } }, error: null });
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  mocks.trust.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe('enrollment API middleware boundary', () => {
  it.each(['', '/', '/template', '/coverage', '/revision/download', '/revision/review'])('authenticates %s with verified getUser and returns anonymous 401', async (suffix) => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    const response = await middleware(request(suffix));
    expect(response.status).toBe(401);
    expect(mocks.user).toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(['/coverage', '/coverage/', '/revision/review', '/revision/review/'])('gates staff-only %s at AAL1', async (suffix) => {
    const response = await middleware(request(suffix, suffix.includes('review') ? 'POST' : 'GET'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['', '/', '/template', '/revision/download'])('keeps mixed-role %s available for server-side persisted-role MFA, not blanket member MFA', async (suffix) => {
    expect((await middleware(request(suffix))).status).toBe(200);
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.user).toHaveBeenCalled();
  });
  it('leaves mixed-role upload to the same authenticated role-aware server guard', async () => {
    expect((await middleware(request('', 'POST'))).status).toBe(200);
    expect(mocks.assurance).not.toHaveBeenCalled(); expect(mocks.user).toHaveBeenCalled();
  });
  it('allows AAL2 staff but fails closed when assurance cannot be verified', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect((await middleware(request('/coverage'))).status).toBe(200);
    mocks.assurance.mockRejectedValue(new Error('unavailable'));
    expect((await middleware(request('/revision/review', 'POST'))).status).toBe(503);
  });
});
