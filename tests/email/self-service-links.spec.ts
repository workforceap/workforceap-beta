import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), generateLink: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() }; } }));
vi.mock('@/lib/email/send', () => ({
  sendBrandedEmailOrThrowOnSkip: mocks.send,
  FixtureRecipientSkippedError: class extends Error {},
  buildDeliverabilityHeaders: vi.fn(),
  htmlToPlainText: vi.fn(),
  isEmailProviderRateLimitError: vi.fn(),
  sanitizeHeaders: vi.fn(),
}));
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: async () => ({
    domain: 'https://tenant.example.test', name: 'Tenant fixture', supportEmail: 'help@example.test',
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { generateLink: mocks.generateLink } } }),
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({ reenableAuthUserAfterRestore: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const SITE = 'https://portal.example.test';
const AUTH = 'https://auth.example.test';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', AUTH);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service');
  vi.stubEnv('RESEND_API_KEY', 'fixture-resend');
  mocks.send.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in email fixture tests'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function renderedLinks(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll('a[href]')].map((a) => ({
    label: a.textContent?.trim(), href: a.getAttribute('href')!,
  }));
}
function capturedLinks() {
  const html = mocks.send.mock.calls.at(-1)?.[1]?.html;
  expect(typeof html).toBe('string');
  return renderedLinks(html);
}
function authAction(type: 'signup' | 'recovery', redirectTo: string) {
  const url = new URL('/auth/v1/verify', AUTH);
  url.searchParams.set('token', 'synthetic+token/with=symbols');
  url.searchParams.set('type', type);
  url.searchParams.set('redirect_to', redirectTo);
  return url.href;
}

describe('rendered self-service HTML hrefs (transport and Auth are synthetic)', () => {
  it('uses the configured site for both application first steps and the main portal button', async () => {
    const { sendApplicationConfirmationEmail } = await import('@/lib/email');
    expect(await sendApplicationConfirmationEmail({ to: 'member@example.test', fullName: 'Fixture Member' })).toEqual({ ok: true });
    const links = capturedLinks();
    for (const [label, target] of [
      ['Start the preassessment', '/dashboard/assessment'],
      ['Open the AI Career Tools', '/dashboard/ai-tools'],
    ]) {
      const url = new URL(links.find((a) => a.label === label)!.href);
      expect(url.origin).toBe(SITE);
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('redirectTo')).toBe(target);
    }
    expect(links.find((a) => a.label === 'Open your member portal')!.href).toBe(`${SITE}/login`);
  });

  it('keeps the signup action and token in both employer verification links', async () => {
    const { sendEmployerVerificationEmail } = await import('@/lib/email');
    const verifyUrl = authAction('signup', `${SITE}/login?verified=1`);
    await sendEmployerVerificationEmail({ to: 'employer@example.test', contactName: 'Fixture Employer', verifyUrl });
    const verificationLinks = capturedLinks().filter((a) => /verify your email address|verify email address/i.test(a.label ?? ''));
    expect(verificationLinks).toHaveLength(2);
    for (const link of verificationLinks) expect(link.href).toBe(verifyUrl);
  });

  it('keeps the canonical invitation token when tenant branding uses a custom host', async () => {
    const { sendInvitationEmail } = await import('@/lib/email');
    const inviteUrl = `${SITE}/invite?token=synthetic-invite-token-123456`;
    await sendInvitationEmail({ to: 'partner@example.test', inviterName: 'Fixture Admin', role: 'partner', inviteUrl });
    expect(capturedLinks().find((a) => a.label === 'Accept Invitation')!.href).toBe(inviteUrl);
  });

  it('keeps destination and opaque recovery token in the actual tenant reset button', async () => {
    const { sendPasswordResetEmail } = await import('@/lib/auth/passwordReset');
    mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'synthetic+hash/with=symbols' } }, error: null });
    const target = '/es/dashboard/program?tab=schedule#week-2';
    const result = await sendPasswordResetEmail('member@example.test', `/reset-password?redirectTo=${encodeURIComponent(target)}`);
    expect(result).toEqual({ error: null, via: 'resend' });
    const url = new URL(capturedLinks().find((a) => a.label === 'Reset password')!.href);
    expect(url.origin).toBe('https://tenant.example.test');
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('redirectTo')).toBe(target);
    expect(url.searchParams.get('token_hash')).toBe('synthetic+hash/with=symbols');
    expect(url.searchParams.get('type')).toBe('recovery');
  });

  it('preserves the provider action-link recovery fallback when hashed_token is absent', async () => {
    const { sendPasswordResetEmail } = await import('@/lib/auth/passwordReset');
    const actionLink = authAction('recovery', 'https://tenant.example.test/reset-password?redirectTo=%2Fdashboard%2Fprogram');
    mocks.generateLink.mockResolvedValue({ data: { properties: { action_link: actionLink } }, error: null });
    expect(await sendPasswordResetEmail('member@example.test')).toEqual({ error: null, via: 'resend' });
    expect(capturedLinks().find((a) => a.label === 'Reset password')!.href).toBe(actionLink);
  });

  it('does not allow Auth-provider URLs in ordinary email buttons', async () => {
    const { brandedEmailLayout } = await import('@/lib/email/template');
    const html = brandedEmailLayout({ title: 'Fixture', bodyHtml: '<p>Fixture</p>', ctaText: 'Open', ctaUrl: authAction('signup', `${SITE}/login`) });
    expect(renderedLinks(html).find((a) => a.label === 'Open')!.href).toBe(`${SITE}/`);
  });

  it.each([
    ['different project', (url: URL) => { url.hostname = 'other-auth.example.test'; }],
    ['lookalike host', (url: URL) => { url.hostname = 'auth.example.test.outside.example'; }],
    ['different endpoint', (url: URL) => { url.pathname = '/auth/v1/authorize'; }],
    ['wrong action', (url: URL) => { url.searchParams.set('type', 'recovery'); }],
    ['missing action', (url: URL) => { url.searchParams.delete('type'); }],
    ['missing token', (url: URL) => { url.searchParams.delete('token'); }],
    ['missing return URL', (url: URL) => { url.searchParams.delete('redirect_to'); }],
    ['external return URL', (url: URL) => { url.searchParams.set('redirect_to', 'https://outside.example/collect'); }],
    ['relative return URL', (url: URL) => { url.searchParams.set('redirect_to', '//outside.example/collect'); }],
    ['non-HTTP return URL', (url: URL) => { url.searchParams.set('redirect_to', `blob:${SITE}/fixture`); }],
    ['return URL credentials', (url: URL) => { url.searchParams.set('redirect_to', 'https://fixture-user@portal.example.test/login'); }],
    ['ambiguous return URL', (url: URL) => { url.searchParams.append('redirect_to', 'https://outside.example/collect'); }],
    ['ambiguous action', (url: URL) => { url.searchParams.append('type', 'recovery'); }],
    ['ambiguous token', (url: URL) => { url.searchParams.append('token', 'other-synthetic-token'); }],
    ['embedded credentials', (url: URL) => { url.username = 'fixture-user'; }],
  ] as const)('rejects a verification CTA with %s', async (_name, mutate) => {
    const { brandedEmailLayout } = await import('@/lib/email/template');
    const url = new URL(authAction('signup', `${SITE}/login`));
    mutate(url);
    const html = brandedEmailLayout({
      title: 'Fixture', bodyHtml: '<p>Fixture</p>', ctaText: 'Verify', ctaUrl: url.href, supabaseAuthAction: 'signup',
    });
    expect(renderedLinks(html).find((a) => a.label === 'Verify')!.href).toBe(`${SITE}/`);
  });

  it('does not add a provider origin when Supabase is unconfigured', async () => {
    const { brandedEmailLayout } = await import('@/lib/email/template');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const html = brandedEmailLayout({
      title: 'Fixture', bodyHtml: '<p>Fixture</p>', ctaText: 'Verify',
      ctaUrl: authAction('signup', `${SITE}/login`), supabaseAuthAction: 'signup',
    });
    expect(renderedLinks(html).find((a) => a.label === 'Verify')!.href).toBe(`${SITE}/`);
  });
});

it('resends the canonical letter without asserting an application or attaching a report', async () => {
  const { sendMemberWelcomeLetterEmail } = await import('@/lib/email');
  expect(await sendMemberWelcomeLetterEmail({ to: 'member@example.test', fullName: 'Fixture Member', memberId: 'member-1' })).toEqual({ ok: true });
  const payload = mocks.send.mock.calls.at(-1)?.[1];
  expect(payload.to).toBe('member@example.test');
  expect(payload.userId).toBe('member-1');
  expect(payload.html).toContain('approximately 160-200 hours of training');
  expect(payload.html).toContain('Complete the WorkforceAP Pre assessment');
  expect(payload.html).toContain('Start here: your first two steps');
  expect(payload.html).not.toContain('Your application is on file');
  expect(payload.attachments).toBeUndefined();
  mocks.send.mockRejectedValueOnce(new Error('provider rejected'));
  expect(await sendMemberWelcomeLetterEmail({ to: 'member@example.test', fullName: 'Fixture Member', memberId: 'member-1' })).toEqual({ ok: false });
});
