// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { installSupabaseStaleSessionConsoleFilter, isSupabaseStaleSessionLog } from '@/lib/auth/authRead';

// The exact shape auth-js console.errors from _emitInitialSession when an
// expired session's refresh token was revoked (Vercel: /middleware, Nov 2026).
const refreshTokenNotFound = () => new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found');
const fakeConsole = () => ({ error: vi.fn(), info: vi.fn() });

afterEach(() => { vi.restoreAllMocks(); });

describe('isSupabaseStaleSessionLog', () => {
  it('matches a lone auth-js stale-session error', () => {
    expect(isSupabaseStaleSessionLog([refreshTokenNotFound()])).toBe(true);
    expect(isSupabaseStaleSessionLog([new AuthApiError('Session not found', 403, 'session_not_found')])).toBe(true);
    expect(isSupabaseStaleSessionLog([new AuthSessionMissingError()])).toBe(true);
  });
  it('does not match genuine failures, extra arguments or look-alike plain objects', () => {
    expect(isSupabaseStaleSessionLog([new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')])).toBe(false);
    expect(isSupabaseStaleSessionLog([new AuthRetryableFetchError('fetch failed', 0)])).toBe(false);
    expect(isSupabaseStaleSessionLog([new AuthApiError('Internal error', 500, 'unexpected_failure')])).toBe(false);
    expect(isSupabaseStaleSessionLog(['[route]', refreshTokenNotFound()])).toBe(false);
    expect(isSupabaseStaleSessionLog([{ name: 'AuthApiError', code: 'refresh_token_not_found', status: 400 }])).toBe(false);
    expect(isSupabaseStaleSessionLog([new Error('Invalid Refresh Token: Refresh Token Not Found')])).toBe(false);
  });
});

describe('installSupabaseStaleSessionConsoleFilter', () => {
  it('downgrades the stale-session log to info without the error or its message', () => {
    const target = fakeConsole(); const original = target.error;
    installSupabaseStaleSessionConsoleFilter(target);
    target.error(refreshTokenNotFound());
    expect(original).not.toHaveBeenCalled();
    expect(target.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(target.info.mock.calls)).not.toContain('Refresh Token Not Found');
  });
  it('passes every other console.error through unchanged', () => {
    const target = fakeConsole(); const original = target.error;
    installSupabaseStaleSessionConsoleFilter(target);
    const genuine = new AuthApiError('Internal error', 500, 'unexpected_failure');
    target.error(genuine);
    target.error('[route]', refreshTokenNotFound());
    target.error('plain message');
    expect(original.mock.calls).toEqual([[genuine], ['[route]', expect.any(AuthApiError)], ['plain message']]);
    expect(target.info).not.toHaveBeenCalled();
  });
  it('is idempotent', () => {
    const target = fakeConsole(); const original = target.error;
    installSupabaseStaleSessionConsoleFilter(target);
    const installed = target.error;
    installSupabaseStaleSessionConsoleFilter(target);
    expect(target.error).toBe(installed);
    target.error('once');
    expect(original).toHaveBeenCalledOnce();
  });
  it('is installed by the middleware module on the global console', async () => {
    await import('@/middleware');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    console.error(refreshTokenNotFound());
    expect(info).toHaveBeenCalledWith('[supabase-auth] Session is no longer valid');
  });
});
