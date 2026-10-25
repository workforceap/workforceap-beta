// @vitest-environment node
// /dev fixtures answer a real 404 at the edge in production, before any page or shell renders.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }) }));
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }) },
    },
  }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {}, warn: () => {}, info: () => {} } }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const request = (path: string) => new NextRequest(`https://www.example.org${path}`);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('production: /dev fixtures are a plain 404 from the middleware', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production');
  });

  it.each([
    '/dev',
    '/dev/member/home',
    '/dev/member/missions',
    '/dev/staff/admin-command',
    '/dev/staff/people',
    '/dev/portal-review',
    '/en/dev/member/home',
    '/es/dev/staff/admin-command',
  ])('%s answers 404 with no body content and noindex', async (path) => {
    const response = await middleware(request(path));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('does not touch public pages or paths that only start with the letters "dev"', async () => {
    for (const path of ['/programs', '/developers', '/devices', '/blog']) {
      const response = await middleware(request(path));
      expect(response.status, path).not.toBe(404);
    }
  });
});

describe('outside production: fixtures stay reachable for review', () => {
  it.each(['preview', 'development'])('VERCEL_ENV=%s does not 404 at the edge', async (env) => {
    vi.stubEnv('VERCEL_ENV', env);
    const response = await middleware(request('/dev/member/home'));
    expect(response.status).not.toBe(404);
  });

  it('with VERCEL_ENV unset (local build) does not 404 at the edge', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    const response = await middleware(request('/dev/member/home'));
    expect(response.status).not.toBe(404);
  });
});
