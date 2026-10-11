// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  getUser: vi.fn(),
  profile: vi.fn(),
  update: vi.fn(),
  verified: vi.fn(),
  event: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.getUser } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://auth.example.test', anonKey: 'fixture' }) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.profile },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { update: mocks.update } }),
  },
}));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: (fn: () => unknown) => fn() }));
vi.mock('@/lib/events/emailVerified', () => ({ emitEmailVerifiedFromCallback: mocks.verified }));
vi.mock('@/lib/events/track', () => ({ trackEvent: mocks.event }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn() } }));

import { GET } from '@/app/auth/callback/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user', email: 'member@example.test' } } });
  mocks.profile.mockResolvedValue({ role: 'member' });
  mocks.update.mockResolvedValue({});
  mocks.verified.mockResolvedValue(undefined);
  mocks.event.mockResolvedValue(undefined);
});

function callback(next?: string, code: string | null = 'fixture-code') {
  const url = new URL('https://portal.example.test/auth/callback');
  if (code !== null) url.searchParams.set('code', code);
  if (next !== undefined) url.searchParams.set('next', next);
  return GET(new NextRequest(url));
}

describe('email confirmation destination (synthetic session and database)', () => {
  it('preserves the member home query and fragment while marking verification', async () => {
    const response = await callback('/dashboard?tab=training&verified=0#week-2');
    expect(response.headers.get('location')).toBe('https://portal.example.test/dashboard?tab=training&verified=1#week-2');
    expect(mocks.exchange).toHaveBeenCalledWith('fixture-code');
  });

  it.each([
    '/dashboard/assessment?from=welcome#saved',
    '/es/dashboard/ai-tools?tab=voice&agentId=fixture-coach#practice',
    '/employer/applications?status=submitted#candidate',
  ])('keeps the complete intended local destination %s', async (target) => {
    const response = await callback(target);
    expect(response.headers.get('location')).toBe(`https://portal.example.test${target}`);
  });

  it.each([
    'https://outside.example/collect',
    '//outside.example/collect',
    '/\\outside.example/collect',
    '/login?redirectTo=/dashboard',
  ])('rejects an unsafe destination or login loop %s', async (target) => {
    const response = await callback(target);
    expect(response.headers.get('location')).toBe('https://portal.example.test/dashboard?verified=1');
  });

  it('retains the existing default member confirmation destination', async () => {
    const response = await callback();
    expect(response.headers.get('location')).toBe('https://portal.example.test/dashboard?verified=1');
  });

  it('retains role-aware staff redirects and authorized admin deep links', async () => {
    mocks.profile.mockResolvedValue({ role: 'counselor' });
    expect((await callback('/dashboard')).headers.get('location')).toBe('https://portal.example.test/counselor');
    mocks.profile.mockResolvedValue({ role: 'super_admin' });
    expect((await callback('/admin/command-center?queue=applications#pending')).headers.get('location'))
      .toBe('https://portal.example.test/admin/command-center?queue=applications#pending');
  });

  it.each(['expired', 'missing-code', 'network-error'])('keeps a safe destination available for login after %s', async (failure) => {
    if (failure === 'expired') mocks.exchange.mockResolvedValue({ error: { message: 'expired fixture code' } });
    if (failure === 'network-error') mocks.exchange.mockRejectedValue(new Error('fixture network error'));
    const target = '/es/dashboard/program?tab=schedule#week-2';
    const response = await callback(target, failure === 'missing-code' ? null : 'fixture-code');
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://portal.example.test');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('confirmation_failed');
    expect(location.searchParams.get('redirectTo')).toBe(target);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.verified).not.toHaveBeenCalled();
  });

  it('does not forward an external destination on failed verification', async () => {
    mocks.exchange.mockResolvedValue({ error: { message: 'expired fixture code' } });
    const response = await callback('https://outside.example/collect');
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('redirectTo')).toBe('/dashboard');
  });
});
