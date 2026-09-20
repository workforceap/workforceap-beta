/**
 * Send-path hardening (2026-09-20 email audit): bulk/cron sends consult the
 * provider suppression list, skip and record dead recipients, and fail open
 * when the list cannot be read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';

vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email/unsubscribeToken', () => ({ buildUnsubscribeUrl: () => 'https://www.workforceap.org/api/unsubscribe?t=x' }));

import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { EMAIL_SEND_WORKFLOW } from '@/lib/email/failureRecord';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { sendBrandedEmail, sendBrandedEmailOrThrowOnSkip, FixtureRecipientSkippedError } from '@/lib/email/send';
import {
  SUPPRESSED_SKIP_METHOD,
  SUPPRESSION_CACHE_TTL_MS,
  loadProviderSuppressions,
  partitionSuppressedRecipients,
  resetProviderSuppressionCache,
} from '@/lib/email/suppressions';

const SUPPRESSED = ['dead@bounced.example.org', 'complained@partner.example.org'];

function suppressionPage(emails: string[], hasMore = false) {
  return new Response(JSON.stringify({
    object: 'list',
    has_more: hasMore,
    data: emails.map((email, index) => ({ id: `sup-${email}-${index}`, email, origin: 'bounce' })),
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fakeResend(calls: Array<{ payload: any; options: any }>) {
  return {
    emails: {
      send: vi.fn(async (payload: unknown, options: unknown) => {
        calls.push({ payload, options });
        return { data: { id: `accepted-${calls.length}` }, error: null };
      }),
    },
  } as unknown as Resend;
}

const baseArgs = {
  from: 'WorkforceAP <hello@workforceap.org>',
  subject: 'We Miss You at WorkforceAP',
  html: '<p>Come back</p>',
};

describe('provider suppression guard', () => {
  const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderSuppressionCache();
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => suppressionPage(SUPPRESSED));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads the list with the account key and caches it for the TTL', async () => {
    const now = { ms: 1_000_000 };
    const first = await loadProviderSuppressions({ now: () => now.ms });
    expect([...first ?? []]).toEqual(SUPPRESSED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.resend.com/suppressions?limit=100');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');

    now.ms += SUPPRESSION_CACHE_TTL_MS - 1;
    await loadProviderSuppressions({ now: () => now.ms });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.ms += 2;
    await loadProviderSuppressions({ now: () => now.ms });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('follows the cursor across pages', async () => {
    fetchMock
      .mockImplementationOnce(async () => suppressionPage(['a@x.example.org'], true))
      .mockImplementationOnce(async () => suppressionPage(['b@x.example.org'], false));
    const set = await loadProviderSuppressions();
    expect([...set ?? []]).toEqual(['a@x.example.org', 'b@x.example.org']);
    expect(String(fetchMock.mock.calls[1][0])).toContain('after=sup-a%40x.example.org-0');
  });

  it('skips a cron send to a suppressed address and records skipped_suppressed', async () => {
    const calls: Array<{ payload: any; options: any }> = [];
    const resend = fakeResend(calls);
    const pacer = createBulkEmailCronPacer({ maxDurationSeconds: 300 });

    const result = await pacer.run(() => sendBrandedEmail(resend, {
      ...baseArgs,
      to: 'Dead Recipient <dead@bounced.example.org>',
      template: { name: 'inactive_nudge', params: { userId: 'u1' } },
    }));

    expect(result).toEqual({ ok: false, skipped: true, reason: 'suppressed_recipient', data: null, error: null });
    expect(calls).toHaveLength(0);
    expect(recordWorkflowDiagnostic).toHaveBeenCalledTimes(1);
    const row = vi.mocked(recordWorkflowDiagnostic).mock.calls[0][0];
    expect(row).toMatchObject({
      workflow: EMAIL_SEND_WORKFLOW,
      status: 'fallback',
      provider: 'resend',
      method: SUPPRESSED_SKIP_METHOD,
      fallbackPath: SUPPRESSED_SKIP_METHOD,
      entityId: 'inactive_nudge',
    });
    expect(row.metadata).toMatchObject({ template: 'inactive_nudge', suppressedCount: 1, recipientDomains: ['bounced.example.org'] });
    expect(JSON.stringify(row)).not.toContain('dead@bounced.example.org');

    // The throwing variant surfaces the same reason to callers that book outcomes.
    await expect(pacer.run(() => sendBrandedEmailOrThrowOnSkip(resend, { ...baseArgs, to: 'dead@bounced.example.org' })))
      .rejects.toMatchObject({ name: 'FixtureRecipientSkippedError', reason: 'suppressed_recipient' });
  });

  it('drops suppressed addresses from a multi-recipient digest but still sends to the rest', async () => {
    const calls: Array<{ payload: any; options: any }> = [];
    const resend = fakeResend(calls);

    const result = await sendBrandedEmail(resend, {
      ...baseArgs,
      to: ['admin@workforceap.org', 'complained@partner.example.org'],
      cc: ['dead@bounced.example.org'],
    }, { deadlineAtMs: Date.now() + 60_000 });

    expect('skipped' in result).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.to).toEqual(['admin@workforceap.org']);
    expect(calls[0].payload.cc).toBeUndefined();
    expect(recordWorkflowDiagnostic).not.toHaveBeenCalled();
  });

  it('leaves single request-path sends alone unless asked', async () => {
    const calls: Array<{ payload: any; options: any }> = [];
    const resend = fakeResend(calls);

    await sendBrandedEmail(resend, { ...baseArgs, to: 'dead@bounced.example.org' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);

    const opted = await sendBrandedEmail(resend, { ...baseArgs, to: 'dead@bounced.example.org' }, { consultSuppressions: true });
    expect(opted).toMatchObject({ skipped: true, reason: 'suppressed_recipient' });
    expect(calls).toHaveLength(1);
  });

  it('fails open: an unreachable or erroring list never blocks a send', async () => {
    const calls: Array<{ payload: any; options: any }> = [];
    const resend = fakeResend(calls);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    fetchMock.mockImplementationOnce(async () => { throw new TypeError('fetch failed'); });
    let result = await sendBrandedEmail(resend, { ...baseArgs, to: 'dead@bounced.example.org' }, { consultSuppressions: true });
    expect('skipped' in result).toBe(false);
    expect(calls).toHaveLength(1);

    fetchMock.mockImplementationOnce(async () => new Response('{"message":"nope"}', { status: 401 }));
    result = await sendBrandedEmail(resend, { ...baseArgs, to: 'dead@bounced.example.org' }, { consultSuppressions: true });
    expect('skipped' in result).toBe(false);
    expect(calls).toHaveLength(2);

    fetchMock.mockImplementationOnce(async () => new Response('not json', { status: 200 }));
    result = await sendBrandedEmail(resend, { ...baseArgs, to: 'dead@bounced.example.org' }, { consultSuppressions: true });
    expect('skipped' in result).toBe(false);
    expect(calls).toHaveLength(3);

    vi.stubEnv('RESEND_API_KEY', '');
    expect(await partitionSuppressedRecipients(['dead@bounced.example.org'])).toEqual({
      consulted: false, suppressed: [], deliverable: ['dead@bounced.example.org'],
    });
    expect(recordWorkflowDiagnostic).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(FixtureRecipientSkippedError).toBeDefined();
  });
});
