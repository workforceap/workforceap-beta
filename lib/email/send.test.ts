import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEmailProviderRateLimitError, sendBrandedEmail, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { buildEmailDedupeKey, type EmailSendLogEntry, type EmailSendLogStore } from '@/lib/email/sendLog';

describe('sendBrandedEmail', () => {
  it('skips reserved and configured fixture recipient domains without calling Resend', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    const originalFixtureDomains = process.env.EMAIL_FIXTURE_DOMAINS;
    process.env.EMAIL_FIXTURE_DOMAINS = 'fixtures.workforceap.internal, qa.example.org';
    let providerCalls = 0;
    const resend = {
      emails: {
        send: async () => {
          providerCalls++;
          return { data: { id: 'must-not-send' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    try {
      for (const to of [
        'member@example.com',
        'member@school.test',
        'member@sample.invalid',
        'member@dev.localhost',
        'member@fixtures.workforceap.internal',
        'member@sub.qa.example.org',
      ]) {
        const result = await sendBrandedEmail(resend, {
          from: 'WorkforceAP <hello@workforceap.org>',
          to,
          subject: 'Fixture safety test',
          html: '<p>Never send</p>',
        });
        assert.deepEqual(result, {
          ok: false,
          skipped: true,
          reason: 'fixture_recipient',
          data: null,
          error: null,
        });
      }
      for (const field of ['to', 'cc', 'bcc'] as const) {
        const result = await sendBrandedEmail(resend, {
          from: 'WorkforceAP <hello@workforceap.org>',
          to: 'member@workforceap.org',
          subject: `Fixture ${field} safety test`,
          html: '<p>Never send</p>',
          [field]: `fixture@${field}.test`,
        });
        assert.equal('skipped' in result && result.skipped, true, `${field} fixture must skip`);
      }
      assert.equal(providerCalls, 0);
    } finally {
      if (originalFixtureDomains === undefined) delete process.env.EMAIL_FIXTURE_DOMAINS;
      else process.env.EMAIL_FIXTURE_DOMAINS = originalFixtureDomains;
    }
  });

  it('throws when Resend returns an error object instead of throwing', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    const resend = {
      emails: {
        send: async () => ({ data: null, error: { name: 'validation_error', message: 'Invalid from address' } }),
      },
    } as unknown as import('resend').Resend;

    await assert.rejects(
      () =>
        sendBrandedEmail(resend, {
          from: 'WorkforceAP <hello@workforceap.org>',
          to: 'applicant@workforceap.org',
          subject: 'Test',
          html: '<p>Hi</p>',
        }),
      /Invalid from address/,
    );
  });

  it('retries Resend 429 responses with provider metadata and preserves the idempotent request', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    const calls: Array<{ payload: unknown; options: unknown }> = [];
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async (payload: unknown, options: unknown) => {
          calls.push({ payload, options });
          if (calls.length === 1) {
            return {
              data: null,
              error: { name: 'rate_limit_exceeded', message: 'Too many requests', retry_after: 2 },
            };
          }
          return { data: { id: 'accepted' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    const result = await sendBrandedEmail(
      resend,
      {
        from: 'WorkforceAP <hello@workforceap.org>',
        to: 'applicant@workforceap.org',
        subject: 'Test',
        html: '<p>Hi</p>',
        idempotencyKey: 'weekly-recap:user-1:2026-09-07',
      },
      { sleep: async (ms) => { delays.push(ms); } },
    );

    assert.equal(result.data?.id, 'accepted');
    assert.deepEqual(delays, [2_000]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
  });

  it('adds deterministic jitter to fallback exponential retry delays', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let attempts = 0;
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          if (attempts < 3) {
            return {
              data: null,
              error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
            };
          }
          return { data: { id: 'accepted-with-jitter' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    const randomValues = [0, 1];
    const result = await sendBrandedEmail(
      resend,
      {
        from: 'WorkforceAP <hello@workforceap.org>',
        to: 'member@workforceap.org',
        subject: 'Jitter test',
        html: '<p>Hi</p>',
      },
      {
        sleep: async (ms) => { delays.push(ms); },
        random: () => randomValues.shift() ?? 0.5,
      },
    );

    assert.equal(result.data?.id, 'accepted-with-jitter');
    assert.deepEqual(delays, [500, 1_250]);
  });

  it('honors a long provider Retry-After before retrying without jittering the provider minimum', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let attempts = 0;
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          if (attempts === 1) {
            return {
              data: null,
              error: {
                name: 'rate_limit_exceeded',
                message: 'Rate limited for one minute',
                headers: { 'Retry-After': '60' },
              },
            };
          }
          return { data: { id: 'accepted-after-provider-window' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    const result = await sendBrandedEmail(
      resend,
      {
        from: 'WorkforceAP <hello@workforceap.org>',
        to: 'applicant@workforceap.org',
        subject: 'Test',
        html: '<p>Hi</p>',
        idempotencyKey: 'weekly-recap:user-1:2026-09-07',
      },
      { sleep: async (ms) => { delays.push(ms); } },
    );

    assert.equal(result.data?.id, 'accepted-after-provider-window');
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [60_000]);
  });

  it('uses provider Retry-After exactly even when below fallback backoff', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          return attempts === 1
            ? { data: null, error: { name: 'rate_limit_exceeded', message: 'brief limit', retry_after: 0.1 } }
            : { data: { id: 'accepted-exact' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;
    await sendBrandedEmail(resend, {
      from: 'WorkforceAP <hello@workforceap.org>',
      to: 'member@workforceap.org',
      subject: 'Exact provider delay',
      html: '<p>Hi</p>',
    }, { sleep: async (ms) => { delays.push(ms); }, random: () => 1 });
    assert.deepEqual(delays, [100]);
  });

  it('does not retry early when provider timing exceeds the total retry budget', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let attempts = 0;
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          return {
            data: null,
            error: {
              name: 'rate_limit_exceeded',
              message: 'Rate limited beyond execution budget',
              headers: { 'Retry-After': '61' },
            },
          };
        },
      },
    } as unknown as import('resend').Resend;

    await assert.rejects(
      () => sendBrandedEmail(
        resend,
        {
          from: 'WorkforceAP <hello@workforceap.org>',
          to: 'applicant@workforceap.org',
          subject: 'Test',
          html: '<p>Hi</p>',
        },
        { sleep: async (ms) => { delays.push(ms); } },
      ),
      /Rate limited beyond execution budget/,
    );

    assert.equal(attempts, 1);
    assert.deepEqual(delays, []);
  });

  it('does not consume a provider retry delay beyond the caller request deadline', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let attempts = 0;
    const delays: number[] = [];
    const nowMs = 1_000;
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          return {
            data: null,
            error: {
              name: 'rate_limit_exceeded',
              message: 'Rate limited beyond remaining request time',
              headers: { 'Retry-After': '60' },
            },
          };
        },
      },
    } as unknown as import('resend').Resend;

    await assert.rejects(
      sendBrandedEmail(
        resend,
        {
          from: 'WorkforceAP <hello@workforceap.org>',
          to: 'applicant@workforceap.org',
          subject: 'Test',
          html: '<p>Hi</p>',
        },
        {
          now: () => nowMs,
          sleep: async (ms) => { delays.push(ms); },
          deadlineAtMs: nowMs + 30_000,
        },
      ),
      /Rate limited beyond remaining request time/,
    );

    assert.equal(attempts, 1);
    assert.deepEqual(delays, []);
  });

  it('inherits the admitted cron deadline for provider retry decisions', async () => {
    let nowMs = 1_000;
    let attempts = 0;
    const delays: number[] = [];
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          return {
            data: null,
            error: { name: 'rate_limit_exceeded', message: 'Retry outside cron deadline', retry_after: 2 },
          };
        },
      },
    } as unknown as import('resend').Resend;
    const pacer = createBulkEmailCronPacer({
      maxDurationSeconds: 2,
      reserveMs: 500,
      startedAtMs: nowMs,
      now: () => nowMs,
      sleep: async (ms) => { nowMs += ms; },
    });

    await assert.rejects(
      pacer.run(() => sendBrandedEmailOrThrowOnSkip(resend, {
        from: 'WorkforceAP <hello@workforceap.org>',
        to: 'member@workforceap.org',
        subject: 'Deadline inheritance',
        html: '<p>Hi</p>',
      }, {
        now: () => nowMs,
        sleep: async (ms) => { delays.push(ms); nowMs += ms; },
      })),
      /Retry outside cron deadline/,
    );
    assert.equal(attempts, 1);
    assert.deepEqual(delays, []);
  });

  it('strips CR/LF from headers so a newline in NEXT_PUBLIC_SITE_URL cannot fail the send', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    // Exactly how the production outage was configured: a pasted trailing newline.
    const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.workforceap.org\n';

    let captured: Record<string, string> | undefined;
    const resend = {
      emails: {
        send: async (payload: { headers?: Record<string, string> }) => {
          captured = payload.headers;
          // Mirror undici: reject any header value carrying CR/LF/NUL.
          for (const [name, value] of Object.entries(payload.headers ?? {})) {
            if (/[\r\n\0]/.test(name) || /[\r\n\0]/.test(value)) {
              throw new Error(
                'Header keys and values cannot contain carriage return, line feed, or null characters.',
              );
            }
          }
          return { data: { id: 'sent' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    try {
      await sendBrandedEmail(resend, {
        from: 'WorkforceAP <hello@workforceap.org>',
        to: 'applicant@workforceap.org',
        subject: 'Test',
        html: '<p>Hi</p>',
      });
    } finally {
      if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }

    const unsubscribe = captured?.['List-Unsubscribe'] ?? '';
    assert.ok(unsubscribe.includes('https://www.workforceap.org/api/unsubscribe'));
    assert.ok(!/[\r\n\0]/.test(unsubscribe));
  });

  it('drops a caller-supplied header that carries a newline instead of failing the whole send', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let captured: Record<string, string> | undefined;
    const resend = {
      emails: {
        send: async (payload: { headers?: Record<string, string> }) => {
          captured = payload.headers;
          return { data: { id: 'sent' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;

    await sendBrandedEmail(resend, {
      from: 'WorkforceAP <hello@workforceap.org>',
      to: 'applicant@workforceap.org',
      subject: 'Test',
      html: '<p>Hi</p>',
      headers: { 'X-Campaign': 'weekly-recap\nX-Injected: evil' },
    });

    assert.equal(captured?.['X-Campaign'], 'weekly-recapX-Injected: evil');
    assert.ok(!/[\r\n\0]/.test(captured?.['X-Campaign'] ?? ''));
  });
});

describe('isEmailProviderRateLimitError', () => {
  it('detects Resend rate_limit_exceeded objects and Too many requests messages', () => {
    assert.equal(isEmailProviderRateLimitError({ name: 'rate_limit_exceeded', message: 'Too many requests' }), true);
    assert.equal(isEmailProviderRateLimitError({ statusCode: 429 }), true);
    assert.equal(
      isEmailProviderRateLimitError(
        new Error('Too many requests. You can only make 10 requests per second.'),
      ),
      true,
    );
    assert.equal(isEmailProviderRateLimitError(new Error('SMTP timeout')), false);
    assert.equal(isEmailProviderRateLimitError(null), false);
  });
});

describe('sendBrandedEmail send log', () => {
  function captureStore() {
    const entries: EmailSendLogEntry[] = [];
    const store: EmailSendLogStore = {
      async record(entry) {
        entries.push({ ...entry });
      },
    };
    return { entries, store };
  }

  it('writes one row per send and keeps the same dedupe key across a provider retry', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let attempts = 0;
    const resend = {
      emails: {
        send: async () => {
          attempts++;
          return attempts === 1
            ? { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', retry_after: 1 } }
            : { data: { id: 'provider-msg-1' }, error: null };
        },
      },
    } as unknown as import('resend').Resend;
    const { entries, store } = captureStore();
    const args = {
      from: 'WorkforceAP <hello@workforceap.org>',
      to: 'Member@workforceap.org',
      subject: 'Your weekly recap',
      html: '<p>Hi</p>',
      templateKey: 'member_weekly_recap',
      userId: 'user-1',
    };

    const result = await sendBrandedEmail(resend, args, { sleep: async () => {}, sendLogStore: store, now: () => Date.parse('2026-09-20T12:00:00Z') });

    assert.equal(result.data?.id, 'provider-msg-1');
    assert.equal(attempts, 2);
    assert.deepEqual(entries.map((e) => e.status), ['sending', 'sent']);
    const keys = new Set(entries.map((e) => e.dedupeKey));
    assert.equal(keys.size, 1, 'every write for one send must target the same row');
    const sent = entries[entries.length - 1];
    assert.equal(sent.templateKey, 'member_weekly_recap');
    assert.equal(sent.providerMessageId, 'provider-msg-1');
    assert.equal(sent.attempts, 2);
    assert.equal(sent.userId, 'user-1');
    assert.equal(sent.recipientDomain, 'workforceap.org');
    assert.ok(sent.recipientHash && !sent.recipientHash.includes('@'), 'no raw address on the row');
    assert.ok(sent.dedupeKey.startsWith('member_weekly_recap/'));
    assert.equal(sent.sentAt?.toISOString(), '2026-09-20T12:00:00.000Z');
  });

  it('derives the same dedupe key for the same message on the same UTC day and a different one the next day', () => {
    const args = { to: ['b@x.org', 'A@X.org'], subject: 'Recap', templateKey: 'member_weekly_recap' };
    const day1 = Date.parse('2026-09-20T01:00:00Z');
    const day1Later = Date.parse('2026-09-20T23:00:00Z');
    const day2 = Date.parse('2026-09-21T01:00:00Z');
    assert.equal(buildEmailDedupeKey(args, day1), buildEmailDedupeKey({ ...args, to: ['a@x.org', 'B@x.org'] }, day1Later));
    assert.notEqual(buildEmailDedupeKey(args, day1), buildEmailDedupeKey(args, day2));
    assert.equal(buildEmailDedupeKey({ ...args, idempotencyKey: 'weekly-recap:user-1:2026-09-14' }, day1), 'weekly-recap:user-1:2026-09-14');
    assert.ok(buildEmailDedupeKey({ to: 'a@x.org', subject: 'x' }, day1).startsWith('untyped/'));
  });

  it('records a skipped fixture recipient and a failed send with the provider error class', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    const { entries, store } = captureStore();
    const skipped = await sendBrandedEmail(
      { emails: { send: async () => { throw new Error('must not send'); } } } as unknown as import('resend').Resend,
      { from: 'WorkforceAP <hello@workforceap.org>', to: 'fixture@example.com', subject: 'Fixture', html: '<p>x</p>' },
      { sendLogStore: store },
    );
    assert.equal('skipped' in skipped && skipped.skipped, true);
    assert.deepEqual(entries.map((e) => [e.status, e.skipReason]), [['skipped', 'fixture_recipient']]);

    entries.length = 0;
    await assert.rejects(
      () => sendBrandedEmail(
        { emails: { send: async () => ({ data: null, error: { name: 'validation_error', statusCode: 422, message: 'Invalid `to` field' } }) } } as unknown as import('resend').Resend,
        { from: 'WorkforceAP <hello@workforceap.org>', to: 'member@workforceap.org', subject: 'Bad', html: '<p>x</p>' },
        { sendLogStore: store, suppressFailureDiagnostic: true },
      ),
      /Invalid `to` field/,
    );
    assert.deepEqual(entries.map((e) => e.status), ['sending', 'failed']);
    assert.equal(entries[1].failureClass, 'provider_rejected');
    assert.equal(entries[1].failureReason, 'Invalid `to` field');
    assert.equal(entries[1].attempts, 1);
  });

  it('never lets a send-log store failure change the send outcome', async () => {
    process.env.CRON_SECRET = 'test-unsubscribe-secret';
    let providerCalls = 0;
    const resend = {
      emails: { send: async () => { providerCalls++; return { data: { id: 'ok-despite-log' }, error: null }; } },
    } as unknown as import('resend').Resend;
    const failingStore: EmailSendLogStore = { async record() { throw new Error('database unavailable'); } };
    const originalError = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const result = await sendBrandedEmail(
        resend,
        { from: 'WorkforceAP <hello@workforceap.org>', to: 'member@workforceap.org', subject: 'Log failure', html: '<p>x</p>' },
        { sendLogStore: failingStore },
      );
      assert.equal(result.data?.id, 'ok-despite-log');
      assert.equal(providerCalls, 1);
    } finally {
      console.error = originalError;
    }
  });
});
