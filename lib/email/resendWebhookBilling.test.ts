import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleResendWebhook, type ResendWebhookStore } from '@/lib/email/resendWebhook';
import { signSvixPayload } from '@/lib/email/webhookSignature';

const SECRET = `whsec_${Buffer.from('a-32-byte-test-secret-for-resend').toString('base64')}`;
const NOW_MS = Date.parse('2026-09-28T18:00:00.000Z');

function signed(rawBody: string, id = 'msg_billing_1') {
  const timestamp = String(Math.floor(NOW_MS / 1_000));
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signSvixPayload(SECRET, id, timestamp, rawBody)}` };
}

function body(type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({ type, created_at: '2026-09-28T17:59:30.000Z', data: { email_id: 're_billing_1', to: ['student@example.test'], ...data } });
}

function store(billingMatched: boolean | null) {
  const billing: Array<{ providerMessageId: string; kind: string; providerEventId: string | null }> = [];
  const disabled: unknown[] = [];
  const diagnostics: Array<{ status: string; summary: string }> = [];
  const applied: unknown[] = [];
  const s: ResendWebhookStore = {
    async applyEvent(input) {
      applied.push(input);
      return { matched: true, userId: 'student-user' };
    },
    async disableNotifications(input) {
      disabled.push(input);
      return 1;
    },
    async logReceipt() {},
    async recordDiagnostic(input) {
      diagnostics.push({ status: input.status, summary: input.summary });
    },
    ...(billingMatched === null
      ? {}
      : {
          async applyBillingDeliveryEvent(input) {
            billing.push({ providerMessageId: input.providerMessageId, kind: input.kind, providerEventId: input.providerEventId });
            return { matched: billingMatched };
          },
        }),
  };
  return { s, billing, disabled, diagnostics, applied };
}

describe('Resend webhook: two-stage billing delivery linkage', () => {
  it('links a delivered event to the billing ledger by provider message id and Svix id, and still updates the send log', async () => {
    const raw = body('email.delivered');
    const { s, billing, applied, disabled } = store(true);
    const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.deepEqual(billing, [{ providerMessageId: 're_billing_1', kind: 'delivered', providerEventId: 'msg_billing_1' }]);
    assert.equal(applied.length, 1);
    assert.equal(disabled.length, 0);
    assert.equal(result.body.billingCopy, true);
  });

  it('never mutes the recipient because a billing copy hard-bounced; records a follow-up diagnostic instead', async () => {
    const raw = body('email.bounced', { bounce: { type: 'Permanent' } });
    const { s, billing, disabled, diagnostics } = store(true);
    const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.equal(billing[0].kind, 'bounced');
    assert.equal(disabled.length, 0);
    assert.equal(result.body.notificationsDisabled, 0);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].status, 'fallback');
    assert.match(diagnostics[0].summary, /Billing J5\/J6 copy/u);
  });

  it('is non-regressive: a non-billing permanent bounce still turns notifications off', async () => {
    const raw = body('email.bounced', { bounce: { type: 'Permanent' } });
    const { s, disabled, diagnostics } = store(false);
    const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.deepEqual(result.body, { ok: true, event: 'bounced', matched: true, notificationsDisabled: 1 });
    assert.equal(disabled.length, 1);
    assert.match(diagnostics[0].summary, /Hard bounce/u);
  });

  it('is non-regressive: a store without the billing method behaves exactly as before', async () => {
    const raw = body('email.complained');
    const { s, disabled } = store(null);
    const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.deepEqual(result.body, { ok: true, event: 'complained', matched: true, notificationsDisabled: 1 });
    assert.equal(disabled.length, 1);
  });

  it('never mutes a billing copy recognized only by its send-log tags (no ledger link: failed settle or gate off)', async () => {
    for (const tags of [{ templateKey: 'billing_two_stage' }, { entityType: 'billing_stage_record' }]) {
      const raw = body('email.bounced', { bounce: { type: 'Permanent' } });
      const { s, disabled, diagnostics } = store(false);
      s.applyEvent = async () => ({ matched: true, userId: 'student-user', templateKey: null, entityType: null, ...tags });
      const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
      assert.equal(result.status, 200);
      assert.equal(disabled.length, 0, JSON.stringify(tags));
      assert.equal(result.body.billingCopy, true);
      assert.equal(diagnostics[0].status, 'fallback');
    }
  });

  it('a billing ledger failure is recorded as a diagnostic and never fails the event or skips general handling', async () => {
    const raw = body('email.bounced', { bounce: { type: 'Permanent' } });
    const { s, disabled, diagnostics, applied } = store(false);
    s.applyBillingDeliveryEvent = async () => {
      throw new Error('ledger down');
    };
    const result = await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.equal(applied.length, 1);
    assert.match(diagnostics[0].summary, /could not be recorded/u);
    assert.equal(diagnostics[0].status, 'error');
    // Not a billing copy by tag either: the general hard-bounce path still runs.
    assert.equal(disabled.length, 1);
    assert.deepEqual(result.body, { ok: true, event: 'bounced', matched: true, notificationsDisabled: 1 });
  });

  it('records only permanent bounces as billing evidence; transient and undetermined bounces raise no follow-up', async () => {
    for (const type of ['Transient', 'Undetermined']) {
      const raw = body('email.bounced', { bounce: { type } });
      const { s, billing, disabled } = store(true);
      await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
      assert.equal(billing.length, 0, type);
      assert.equal(disabled.length, 0, type);
    }
    const raw = body('email.bounced', { bounce: { type: 'Permanent' } });
    const { s, billing } = store(true);
    await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
    assert.deepEqual(billing.map((b) => b.kind), ['bounced']);
  });

  it('does not consult the billing ledger for events it does not record (opened, sent)', async () => {
    for (const type of ['email.opened', 'email.sent']) {
      const raw = body(type);
      const { s, billing } = store(true);
      await handleResendWebhook({ headers: signed(raw), rawBody: raw, secret: SECRET, store: s, now: () => NOW_MS });
      assert.equal(billing.length, 0, type);
    }
  });
});
