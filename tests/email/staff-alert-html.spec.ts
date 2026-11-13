import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('resend', () => ({ Resend: class MockResend {} }));
vi.mock('@/lib/email/send', () => {
  class FixtureRecipientSkippedError extends Error {
    readonly reason = 'fixture_recipient' as const;
  }
  const sendBrandedEmail = vi.fn().mockResolvedValue(undefined);
  return {
    FixtureRecipientSkippedError,
    sendBrandedEmail,
    sendBrandedEmailOrThrowOnSkip: sendBrandedEmail,
  };
});
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));

import {
  sendCourseraUnmatchedActorAlertEmail,
  sendPreScreeningReadyEmail,
} from '@/lib/email';
import { sendBrandedEmail } from '@/lib/email/send';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'fixture-no-network');
  vi.stubEnv('EMAIL_TO_ADMIN', 'staff@example.org');
  vi.stubEnv('COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS', 'ops@example.org');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('staff alert HTML escaping', () => {
  it('escapes pre-screening member, goal, hours, and barrier fields', async () => {
    await expect(
      sendPreScreeningReadyEmail({
        memberName: 'Ada <script>alert(1)</script>',
        memberEmail: 'ada+"<img src=x>"@example.test',
        goal: 'Work <b>soon</b>',
        weeklyHours: '10<script>',
        barrierSummary: 'Childcare & <transport>',
        memberId: 'member-"quoted"',
      }),
    ).resolves.toEqual({ ok: true });

    const payload = vi.mocked(sendBrandedEmail).mock.calls[0][1];
    expect(payload.to).toEqual(['staff@example.org']);
    expect(payload.subject).toBe('Interview ready: Ada <script>alert(1)</script>');
    expect(payload.html).not.toContain('<script>alert(1)</script>');
    expect(payload.html).not.toContain('<img src=x>');
    expect(payload.html).toContain('Ada &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(payload.html).toContain('ada+&quot;&lt;img src=x&gt;&quot;@example.test');
    expect(payload.html).toContain('Work &lt;b&gt;soon&lt;/b&gt;');
    expect(payload.html).toContain('10&lt;script&gt;');
    expect(payload.html).toContain('Childcare &amp; &lt;transport&gt;');
    expect(payload.html).toContain('/admin/members/member-%22quoted%22');
  });

  it('escapes unmatched Coursera actor email and statement id', async () => {
    await expect(
      sendCourseraUnmatchedActorAlertEmail({
        actorEmail: 'learner+"<script>"@example.test',
        statementId: '<img src=x>',
      }),
    ).resolves.toEqual({ ok: true });

    const payload = vi.mocked(sendBrandedEmail).mock.calls[0][1];
    expect(payload.to).toEqual(['ops@example.org']);
    expect(payload.subject).toBe('Coursera unmatched actor: learner+"<script>"@example.test');
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).not.toContain('<img src=x>');
    expect(payload.html).toContain('learner+&quot;&lt;script&gt;&quot;@example.test');
    expect(payload.html).toContain('&lt;img src=x&gt;');
  });
});
