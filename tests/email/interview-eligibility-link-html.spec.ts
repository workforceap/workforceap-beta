import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  branding: vi.fn(),
}));

vi.mock('resend', () => ({ Resend: class MockResend {} }));
vi.mock('@/lib/email/send', () => {
  class FixtureRecipientSkippedError extends Error {
    readonly reason = 'fixture_recipient' as const;
  }
  return {
    FixtureRecipientSkippedError,
    sendBrandedEmail: h.send,
    sendBrandedEmailOrThrowOnSkip: h.send,
  };
});
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: h.branding,
}));

import { sendEligibilityLink, sendInterviewPrepLink } from '@/lib/email';

const branding = {
  orgId: 'org-1',
  name: 'Org <img src=x>',
  logoUrl: 'https://cdn.example.test/logo.png',
  primaryColor: '#4a9b4f',
  supportEmail: 'help@example.test',
  domain: 'https://portal.example.test',
  domainLabel: 'portal.example.test',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'fixture-no-network');
  h.send.mockResolvedValue(undefined);
  h.branding.mockResolvedValue(branding);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendInterviewPrepLink HTML', () => {
  it('fails closed without a send when Resend is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(
      sendInterviewPrepLink({
        to: 'ada@org.test',
        name: 'Ada',
        url: 'https://portal.example.test/dashboard/ai-tools/interview-prep',
        orgId: 'org-1',
      }),
    ).resolves.toEqual({ ok: false, error: 'Email not configured' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.branding).not.toHaveBeenCalled();
  });

  it('escapes a hostile member name and org name, and keeps the portal CTA', async () => {
    await expect(
      sendInterviewPrepLink({
        to: 'ada@org.test',
        name: 'Ada <script>alert(1)</script>',
        url: 'https://portal.example.test/dashboard/ai-tools/interview-prep',
        orgId: 'org-1',
      }),
    ).resolves.toEqual({ ok: true });

    const payload = h.send.mock.calls[0][1] as { to: string; subject: string; html: string };
    expect(payload.to).toBe('ada@org.test');
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).not.toContain('<img src=x>');
    expect(payload.html).toContain('Hi Ada &lt;script&gt;alert(1)&lt;/script&gt;,');
    expect(payload.html).toContain('Your Org &lt;img src=x&gt; team');
    expect(payload.html).toContain(
      'href="https://portal.example.test/dashboard/ai-tools/interview-prep"',
    );
    expect(payload.subject).toContain('Org <img src=x>');
  });

  it('greets without a name token when the member name is blank', async () => {
    await expect(
      sendInterviewPrepLink({
        to: 'ada@org.test',
        name: '   ',
        url: 'https://portal.example.test/dashboard/ai-tools/interview-prep',
      }),
    ).resolves.toEqual({ ok: true });
    const html = (h.send.mock.calls[0][1] as { html: string }).html;
    expect(html).toContain('Hi,');
    expect(html).not.toContain('Hi    ,');
  });

  it('replaces a javascript CTA with the branding origin', async () => {
    await expect(
      sendInterviewPrepLink({
        to: 'ada@org.test',
        name: 'Ada',
        url: 'javascript:alert(1)',
        orgId: 'org-1',
      }),
    ).resolves.toEqual({ ok: true });
    const html = (h.send.mock.calls[0][1] as { html: string }).html;
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('href="https://portal.example.test/"');
  });
});

describe('sendEligibilityLink HTML', () => {
  it('escapes the member name and org name on the eligibility CTA', async () => {
    await expect(
      sendEligibilityLink({
        to: 'ada@org.test',
        name: 'Ada <script>alert(1)</script>',
        url: 'https://portal.example.test/dashboard/eligibility">click',
        orgId: 'org-1',
      }),
    ).resolves.toEqual({ ok: true });

    const payload = h.send.mock.calls[0][1] as { subject: string; html: string };
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).toContain('Hi Ada &lt;script&gt;alert(1)&lt;/script&gt;,');
    expect(payload.html).toContain('your Org &lt;img src=x&gt; file');
    expect(payload.html).not.toContain('href="https://portal.example.test/dashboard/eligibility">click"');
    expect(payload.subject).toContain('Org <img src=x>');
  });

  it('includes the escaped soft-deadline reminder only when requested', async () => {
    await expect(
      sendEligibilityLink({
        to: 'ada@org.test',
        name: 'Ada',
        url: 'https://portal.example.test/dashboard/eligibility',
        orgId: 'org-1',
      }),
    ).resolves.toEqual({ ok: true });
    expect((h.send.mock.calls[0][1] as { html: string }).html).not.toContain(
      'Please complete by September 14',
    );

    await expect(
      sendEligibilityLink({
        to: 'ada@org.test',
        name: 'Ada',
        url: 'https://portal.example.test/dashboard/eligibility',
        orgId: 'org-1',
        softDeadlineReminder: true,
      }),
    ).resolves.toEqual({ ok: true });
    const html = (h.send.mock.calls[1][1] as { html: string; subject: string }).html;
    expect(html).toContain('Please complete by September 14 to keep your membership current.');
    expect((h.send.mock.calls[1][1] as { subject: string }).subject).toContain(
      'Please complete your eligibility info by Sept 14',
    );
  });
});
