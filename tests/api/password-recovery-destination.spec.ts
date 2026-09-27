import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendEmail: vi.fn(),
  template: vi.fn((_props: { ctaUrl: string }) => '<html>Recovery email fixture</html>'),
  fallbackReset: vi.fn(),
  createClient: vi.fn(),
  resend: {} as object | null,
  findMany: vi.fn(),
  beginClaim: vi.fn(),
  releaseClaim: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkForgotPasswordRateLimit: vi.fn(async () => ({ success: true })),
  checkForgotPasswordEmailRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '127.0.0.1' }));
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: vi.fn(async () => ({ domain: 'https://training.example.test', name: 'Training fixture', supportEmail: 'help@example.test' })),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ auth: { admin: { generateLink: providers.generateLink } } }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { findMany: providers.findMany } }) } }));
vi.mock('@/lib/member/uploadLifecycle', () => ({
  beginMemberUpload: providers.beginClaim,
  releaseMemberUpload: providers.releaseClaim,
  MemberUploadLifecycleError: class MemberUploadLifecycleError extends Error {
    reason: string;
    constructor(reason = 'member_inactive') { super(reason); this.reason = reason; }
  },
}));
vi.mock('@/lib/email', () => ({ getResend: () => providers.resend }));
vi.mock('@/lib/email/send', () => ({
  sendBrandedEmail: providers.sendEmail,
  sendBrandedEmailOrThrowOnSkip: providers.sendEmail,
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: providers.template }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: providers.createClient }));

import { POST } from '@/app/api/auth/forgot-password/route';
import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';
import { checkForgotPasswordEmailRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/observability/logger';

beforeEach(() => {
  vi.clearAllMocks();
  providers.generateLink.mockReset();
  providers.sendEmail.mockReset();
  providers.fallbackReset.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service');
  providers.resend = {};
  providers.findMany.mockResolvedValue([{ id: 'learner-1', email: 'learner@example.test', fullName: 'Learner', phone: null }]);
  providers.beginClaim.mockResolvedValue('claim-1');
  providers.releaseClaim.mockResolvedValue(undefined);
  providers.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'opaque+token/with=symbols' } }, error: null });
  providers.sendEmail.mockResolvedValue(undefined);
  providers.fallbackReset.mockResolvedValue({ error: null });
  providers.createClient.mockReturnValue({ auth: { resetPasswordForEmail: providers.fallbackReset } });
  vi.mocked(checkForgotPasswordEmailRateLimit).mockResolvedValue({ success: true });
});
afterEach(() => { vi.unstubAllEnvs(); });

function request(redirectTo?: unknown) {
  return new Request('https://training.example.test/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'learner@example.test', redirectTo }),
  });
}

describe('password recovery destination across real route and mailer (mocked providers)', () => {
  it('keeps destination, locale, query and fragment separate from the recovery token', async () => {
    const target = '/es/dashboard/learning/modules/it-lab?program=it-support&tab=notes#practice';
    const response = await POST(request(target));
    expect(response.status).toBe(200);
    const url = new URL(providers.template.mock.calls[0][0].ctaUrl);
    expect(url.origin).toBe('https://training.example.test');
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('redirectTo')).toBe(target);
    expect(url.searchParams.get('token_hash')).toBe('opaque+token/with=symbols');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(providers.sendEmail).toHaveBeenCalledTimes(1);
    const providerUrl = new URL(providers.generateLink.mock.calls[0][0].options.redirectTo);
    expect(providerUrl.searchParams.get('redirectTo')).toBe(target);
  });

  it.each([undefined, 'https://outside.example/collect', '//outside.example/collect', '/\\outside.example', '/login?redirectTo=/dashboard/program', { bad: 'input' }])('normalizes unsafe or absent destination %j on the server', async (target) => {
    const response = await POST(request(target));
    expect(response.status).toBe(200);
    const url = new URL(providers.template.mock.calls[0][0].ctaUrl);
    expect(url.origin).toBe('https://training.example.test');
    expect(url.searchParams.get('redirectTo')).toBe('/dashboard');
    expect(url.searchParams.get('token_hash')).toBe('opaque+token/with=symbols');
  });

  it('preserves the recovery destination with the Supabase fallback mailer', async () => {
    providers.resend = null;
    await POST(request('/dashboard/program?tab=schedule'));
    expect(providers.sendEmail).not.toHaveBeenCalled();
    const url = new URL(providers.fallbackReset.mock.calls[0][1].redirectTo);
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('redirectTo')).toBe('/dashboard/program?tab=schedule');
  });

  it('keeps existing staff-issued reset links without a destination working', async () => {
    await sendPasswordResetEmail('learner@example.test', '/reset-password', { orgId: 'fixture-org' });
    const url = new URL(providers.template.mock.calls[0][0].ctaUrl);
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('token_hash')).toBe('opaque+token/with=symbols');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.has('redirectTo')).toBe(false);
  });

  it('keeps the same public response for unknown accounts and sends no email', async () => {
    providers.findMany.mockResolvedValue([]);
    providers.generateLink.mockResolvedValue({ data: null, error: { message: 'User not found' } });
    const response = await POST(request('/dashboard/program'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: 'If an account exists for that email, you will receive reset instructions shortly.' });
    expect(providers.sendEmail).not.toHaveBeenCalled();
    expect(providers.fallbackReset).not.toHaveBeenCalled();
  });

  it('falls back after branded delivery rejects, without depending on a browser PKCE verifier', async () => {
    providers.sendEmail.mockRejectedValueOnce(new Error('Resend rejected this request'));
    const result = await sendPasswordResetEmail(' Learner@Example.Test ', '/reset-password?redirectTo=%2Fdashboard%2Fprogram');
    expect(result).toEqual({ error: null, via: 'supabase' });
    expect(providers.generateLink).toHaveBeenCalledWith(expect.objectContaining({ email: 'learner@example.test' }));
    expect(providers.fallbackReset).toHaveBeenCalledOnce();
    expect(providers.fallbackReset).toHaveBeenCalledWith('learner@example.test', {
      redirectTo: 'https://training.example.test/reset-password?redirectTo=%2Fdashboard%2Fprogram',
    });
    expect(providers.createClient).toHaveBeenCalledWith('https://auth.example.test', 'fixture-anon', {
      auth: { flowType: 'implicit', autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    expect(logger.info).toHaveBeenCalledWith('passwordReset: recovery request accepted by provider', { via: 'supabase' });
  });

  it('keeps the durable claim until the fallback provider settles', async () => {
    providers.resend = null;
    let finishFallback!: () => void;
    providers.fallbackReset.mockImplementation(() => new Promise((resolve) => {
      finishFallback = () => resolve({ error: null });
    }));

    const pending = sendPasswordResetEmail('learner@example.test');
    await vi.waitFor(() => expect(providers.fallbackReset).toHaveBeenCalledOnce());
    expect(providers.releaseClaim).not.toHaveBeenCalled();
    finishFallback();
    expect(await pending).toMatchObject({ via: 'supabase' });
    expect(providers.releaseClaim).toHaveBeenCalledWith('learner-1', 'claim-1');
  });

  it.each(['provider-error', 'missing-link', 'thrown-request'])('tries the fallback when recovery link creation fails: %s', async (failure) => {
    if (failure === 'provider-error') providers.generateLink.mockResolvedValueOnce({ data: null, error: { message: 'Endpoint not found' } });
    if (failure === 'missing-link') providers.generateLink.mockResolvedValueOnce({ data: { properties: {} }, error: null });
    if (failure === 'thrown-request') providers.generateLink.mockRejectedValueOnce(new Error('Network unavailable'));
    expect(await sendPasswordResetEmail('learner@example.test')).toEqual({ error: null, via: 'supabase' });
    expect(providers.sendEmail).not.toHaveBeenCalled();
    expect(providers.fallbackReset).toHaveBeenCalledOnce();
  });

  it('does not claim delivery or expose provider details when both mailers fail', async () => {
    providers.sendEmail.mockRejectedValueOnce(new Error('Resend failed: sensitive provider detail'));
    providers.fallbackReset.mockResolvedValueOnce({ error: { message: 'SMTP secret configuration detail' } });
    const response = await POST(request('/dashboard/program'));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: expect.stringContaining('Password reset is temporarily unavailable') });
    expect(providers.sendEmail).toHaveBeenCalledOnce();
    expect(providers.fallbackReset).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('reports thrown fallback transport errors without an unhandled rejection', async () => {
    providers.resend = null;
    providers.fallbackReset.mockRejectedValueOnce(new Error('Connection failed'));
    expect(await sendPasswordResetEmail('learner@example.test')).toEqual({ error: { message: 'Connection failed' }, via: 'supabase' });
  });

  it('classifies the provider user_not_found code as unknown without another delivery attempt', async () => {
    providers.findMany.mockResolvedValue([]);
    providers.generateLink.mockResolvedValueOnce({ data: null, error: { code: 'user_not_found', message: 'Account absent' } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(providers.fallbackReset).not.toHaveBeenCalled();
    expect(providers.sendEmail).not.toHaveBeenCalled();
  });

  it('reports an email rate limit honestly and does not attempt delivery', async () => {
    vi.mocked(checkForgotPasswordEmailRateLimit).mockResolvedValueOnce({ success: false });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(await response.json()).toEqual({ error: expect.stringContaining('Too many reset requests') });
    expect(providers.generateLink).not.toHaveBeenCalled();
    expect(providers.fallbackReset).not.toHaveBeenCalled();
  });

  it('includes the working recovery URL in the explicit plain-text email', async () => {
    await sendPasswordResetEmail('learner@example.test');
    expect(providers.sendEmail.mock.calls[0][1].text).toContain(providers.template.mock.calls[0][0].ctaUrl);
    expect(providers.fallbackReset).not.toHaveBeenCalled();
  });
});
