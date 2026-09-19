// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({
  user: vi.fn(), session: vi.fn(), account: vi.fn(),
  jar: new Map<string, string>(), cookieWrites: vi.fn(),
  adapter: undefined as undefined | { setAll: (cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void },
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: { cookies: typeof h.adapter }) => {
  h.adapter = options.cookies;
  return { auth: { getUser: h.user, getSession: h.session } };
} }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => h.jar.has(name) ? { name, value: h.jar.get(name) } : undefined,
  getAll: () => [...h.jar].map(([name,value]) => ({ name, value })),
  set: (name: string, value: string, options: unknown) => { h.cookieWrites(name, value, options); h.jar.set(name, value); },
}) }));
vi.mock('next/navigation', () => ({ unstable_rethrow: (error: { digest?: string }) => { if (error?.digest?.startsWith('NEXT_')) throw error; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { findUnique: h.account } }) } }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: async () => 'member' }));
import { classifyAuthReadFailure, readAuthWithRetry } from '@/lib/auth/authRead';
import { middleware } from '@/middleware';
import { getUser, getSession } from '@/lib/auth/server';

const stale = { name: 'AuthApiError', code: 'refresh_token_not_found', status: 400, message: 'DO_NOT_LOG_TOKEN' };
const transient = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
const good = { data: { user: { id: 'verified-user' } }, error: null };
const missing = (error: unknown) => ({ data: { user: null }, error });
const cookieHeader = 'sb-fixture-auth-token.0=part0; sb-fixture-auth-token.1=part1; sb-fixture-auth-token-code-verifier=pkce; wa_session_only=1; wap_locale=es; partner_ref=partner';
const request = (path: string) => new NextRequest('https://www.workforceap.org' + path, { headers: {
  host: 'www.workforceap.org', cookie: cookieHeader, 'x-request-id': 'd362e490-b287-4509-9bcb-0ef027b2f8ae', 'user-agent': 'Synthetic',
} });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic');
  vi.stubEnv('STAFF_MFA_ENFORCEMENT', '0');
  h.user.mockResolvedValue(good); h.session.mockResolvedValue({ data: { session: { user: { id: 'verified-user' } } }, error: null });
  h.account.mockResolvedValue({ deletedAt: null }); h.jar.clear(); h.adapter = undefined;
  for (const part of cookieHeader.split('; ')) { const [name, value] = part.split('='); h.jar.set(name, value); }
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('auth read classification and retry budget', () => {
  it.each(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'bad_jwt', 'user_not_found'])('quiet expected state %s without retry', async code => {
    const read = vi.fn().mockResolvedValue(missing({ ...stale, code }));
    expect(await readAuthWithRetry(read)).toEqual(missing({ ...stale, code }));
    expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    { name: 'AuthSessionMissingError' },
    { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found' },
  ])('recognizes SDK missing-session compatibility shape', error => {
    expect(classifyAuthReadFailure(error)).toBe('stale_session');
  });
  it.each([
    { code: 'invalid_credentials', status: 400 }, { status: 401 }, { status: 429 },
    new Error('fetch failed'), { name: 'AbortError' },
  ])('does not retry credentials, rate limits, arbitrary errors or cancellation', async error => {
    const read = vi.fn().mockRejectedValue(error);
    await expect(readAuthWithRetry(read)).rejects.toBe(error);
    expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('retries one thrown transport error after exactly 300ms', async () => {
    const read = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce(good);
    const pending = readAuthWithRetry(read);
    await vi.advanceTimersByTimeAsync(299); expect(read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual(good); expect(read).toHaveBeenCalledTimes(2);
  });
  it('retries returned provider errors once and stops after the second failure', async () => {
    const read = vi.fn().mockResolvedValue(missing({ name: 'AuthRetryableFetchError', status: 503 }));
    const pending = readAuthWithRetry(read);
    await vi.advanceTimersByTimeAsync(300); expect((await pending).error).toMatchObject({ status: 503 });
    expect(read).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('middleware cookie and identity boundary', () => {
  it.each(['/dashboard?tab=training', '/api/member/notifications'])('clears only session chunks and preserves response state on %s', async path => {
    h.user.mockImplementationOnce(async () => {
      h.adapter!.setAll([{ name: 'sb-fixture-auth-token.2', value: 'newchunk' }, { name: 'provider_marker', value: 'keep' }, { name: 'sb-fixture-auth-token-code-verifier', value: '', options: { maxAge: 0 } }]);
      return missing(stale);
    });
    const response = await middleware(request(path));
    expect(response.status).toBe(path.startsWith('/api') ? 401 : 307);
    expect(response.headers.get('x-request-id')).toBe('d362e490-b287-4509-9bcb-0ef027b2f8ae');
    for (const name of ['sb-fixture-auth-token.0', 'sb-fixture-auth-token.1', 'sb-fixture-auth-token.2']) {
      expect(response.cookies.get(name)).toMatchObject({ value: '', maxAge: 0 });
    }
    expect(response.cookies.get('provider_marker')?.value).toBe('keep');
    for (const name of ['sb-fixture-auth-token-code-verifier', 'wa_session_only', 'partner_ref']) expect(response.cookies.get(name)).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled(); expect(console.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('DO_NOT_LOG_TOKEN');
    expect(h.user).toHaveBeenCalledOnce();
    if (!path.startsWith('/api')) expect(new URL(response.headers.get('location')!).searchParams.get('redirectTo')).toBe('/dashboard?tab=training');
  });
  it('preserves authentication after one transport failure then a verified success', async () => {
    h.user.mockRejectedValueOnce(transient).mockResolvedValueOnce(good);
    const pending = middleware(request('/api/member/notifications'));
    await vi.advanceTimersByTimeAsync(300);
    const response = await pending;
    expect(response.status).toBe(200); expect(h.user).toHaveBeenCalledTimes(2);
    expect(response.headers.get('x-middleware-request-x-wap-user-id')).toBe('verified-user');
    expect(response.cookies.get('sb-fixture-auth-token.0')).toBeUndefined();
  });
  it('does not clear cookies or forward an identity when transport retries are exhausted', async () => {
    h.user.mockResolvedValue({ ...good, error: { name: 'AuthRetryableFetchError', status: 0 } });
    const pending = middleware(request('/api/member/notifications'));
    await vi.advanceTimersByTimeAsync(300);
    const response = await pending;
    expect(response.status).toBe(401); expect(h.user).toHaveBeenCalledTimes(2);
    expect(response.cookies.get('sb-fixture-auth-token.0')).toBeUndefined();
    expect(response.headers.get('x-middleware-request-x-wap-user-id')).toBeNull();
  });
  it('also handles returned session errors on cookie-bearing public pages', async () => {
    h.session.mockResolvedValue({ data: { session: { user: { id: 'unverified' } } }, error: stale });
    const response = await middleware(request('/en/about'));
    expect(response.status).toBe(200); expect(h.user).not.toHaveBeenCalled();
    expect(response.cookies.get('sb-fixture-auth-token.0')).toMatchObject({ value: '', maxAge: 0 });
    expect(response.headers.get('x-middleware-request-x-wap-user-id')).toBeNull();
    expect(response.headers.get('x-middleware-request-cookie')).toContain('auth-token-code-verifier=pkce');
    expect(response.headers.get('x-middleware-request-cookie')).not.toContain('auth-token.0=');
  });
});

describe('Node auth reads keep application-account checks', () => {
  it('returns verified user after transient retry and still checks deletion', async () => {
    h.user.mockRejectedValueOnce(transient).mockResolvedValueOnce(good);
    const pending = getUser();
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toEqual(good.data.user); expect(h.account).toHaveBeenCalledOnce();
  });
  it('never restores an application soft-deleted account after successful auth', async () => {
    h.account.mockResolvedValue({ deletedAt: new Date() });
    expect(await getUser()).toBeNull();
    expect(await getSession()).toBeNull();
  });
  it('clears stale session chunks in writable server contexts, preserving PKCE', async () => {
    h.user.mockImplementationOnce(async () => {
      h.adapter!.setAll([{ name: 'sb-fixture-auth-token-code-verifier', value: '', options: { maxAge: 0 } }]);
      return missing(stale);
    });
    expect(await getUser()).toBeNull(); expect(h.account).not.toHaveBeenCalled();
    expect(h.jar.get('sb-fixture-auth-token.0')).toBe('');
    expect(h.jar.get('sb-fixture-auth-token-code-verifier')).toBe('pkce');
    expect(console.error).not.toHaveBeenCalled();
  });
  it('quietly handles read-only server cookie stores without weakening denial', async () => {
    h.cookieWrites.mockImplementationOnce(() => { throw new Error('Cookies are read-only'); });
    h.session.mockResolvedValueOnce({ data: { session: null }, error: stale });
    expect(await getSession()).toBeNull(); expect(console.error).not.toHaveBeenCalled();
  });
});
