import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleResendWebhook,
  isHardDeliveryFailure,
  parseResendEvent,
  type ResendWebhookApplyInput,
  type ResendWebhookStore,
} from '@/lib/email/resendWebhook';
import { signSvixPayload, verifySvixSignature } from '@/lib/email/webhookSignature';

const SECRET = `whsec_${Buffer.from('a-32-byte-test-secret-for-resend').toString('base64')}`;
const NOW_MS = Date.parse('2026-09-20T18:00:00.000Z');

function signedHeaders(rawBody: string, overrides: Partial<Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>> = {}) {
  const id = overrides['svix-id'] ?? 'msg_test_1';
  const timestamp = overrides['svix-timestamp'] ?? String(Math.floor(NOW_MS / 1_000));
  const signature = overrides['svix-signature'] ?? `v1,${signSvixPayload(SECRET, id, timestamp, rawBody)}`;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

function eventBody(type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    type,
    created_at: '2026-09-20T17:59:30.000Z',
    data: {
      email_id: 'resend-msg-42',
      from: 'WorkforceAP <hello@workforceap.org>',
      to: ['Member@Example.org'],
      subject: 'Your weekly recap',
      ...data,
    },
  });
}

function fakeStore(options: { matched?: boolean; userId?: string | null } = {}) {
  const applied: ResendWebhookApplyInput[] = [];
  const disabled: Array<{ userId: string | null; recipients: string[] }> = [];
  const receipts: Array<{ status: string; httpStatusCode?: number | null; eventType?: string | null }> = [];
  const diagnostics: Array<{ status: string; summary: string }> = [];
  const store: ResendWebhookStore = {
    async applyEvent(input) {
      applied.push(input);
      return { matched: options.matched ?? true, userId: options.userId !== undefined ? options.userId : 'user-7' };
    },
    async disableNotifications(input) {
      disabled.push(input);
      return 1;
    },
    async logReceipt(input) {
      receipts.push({ status: input.status, httpStatusCode: input.httpStatusCode, eventType: input.eventType });
    },
    async recordDiagnostic(input) {
      diagnostics.push({ status: input.status, summary: input.summary });
    },
  };
  return { store, applied, disabled, receipts, diagnostics };
}

describe('verifySvixSignature', () => {
  it('accepts a v1 signature over id.timestamp.body and rejects a tampered body', () => {
    const body = '{"type":"email.delivered"}';
    const headers = signedHeaders(body);
    assert.deepEqual(
      verifySvixSignature({ secret: SECRET, msgId: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'], payload: body, nowMs: NOW_MS }),
      { ok: true },
    );
    const tampered = verifySvixSignature({ secret: SECRET, msgId: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'], payload: body + ' ', nowMs: NOW_MS });
    assert.deepEqual(tampered, { ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a stale timestamp even when the signature is otherwise valid', () => {
    const body = '{}';
    const oldTimestamp = String(Math.floor(NOW_MS / 1_000) - 6 * 60);
    const headers = signedHeaders(body, { 'svix-timestamp': oldTimestamp });
    const result = verifySvixSignature({ secret: SECRET, msgId: headers['svix-id'], timestamp: oldTimestamp, signature: headers['svix-signature'], payload: body, nowMs: NOW_MS });
    assert.deepEqual(result, { ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('accepts any one of several rotated signatures in the header', () => {
    const body = '{"rotated":true}';
    const headers = signedHeaders(body);
    const result = verifySvixSignature({
      secret: SECRET,
      msgId: headers['svix-id'],
      timestamp: headers['svix-timestamp'],
      signature: `v1,${Buffer.from('not-the-right-one').toString('base64')} ${headers['svix-signature']}`,
      payload: body,
      nowMs: NOW_MS,
    });
    assert.deepEqual(result, { ok: true });
  });
});

describe('handleResendWebhook', () => {
  it('updates the send-log row for a validly signed delivered event', async () => {
    const body = eventBody('email.delivered');
    const { store, applied, disabled, receipts } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, event: 'delivered', matched: true, notificationsDisabled: 0 });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].providerMessageId, 'resend-msg-42');
    assert.equal(applied[0].event, 'delivered');
    assert.equal(applied[0].eventAt.toISOString(), '2026-09-20T17:59:30.000Z');
    assert.equal(applied[0].bounceType, null);
    assert.equal(disabled.length, 0);
    assert.deepEqual(receipts, [{ status: 'success', httpStatusCode: 200, eventType: 'email.delivered' }]);
  });

  it('rejects an invalid signature with 401 and touches no send-log row', async () => {
    const body = eventBody('email.delivered');
    const headers = signedHeaders(body, { 'svix-signature': `v1,${Buffer.from('forged').toString('base64')}` });
    const { store, applied, disabled, receipts } = fakeStore();
    const result = await handleResendWebhook({ headers, rawBody: body, secret: SECRET, store, now: () => NOW_MS });

    assert.equal(result.status, 401);
    assert.equal(applied.length, 0);
    assert.equal(disabled.length, 0);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status, 'failed');
    assert.equal(receipts[0].httpStatusCode, 401);
  });

  it('rejects a request signed for a different body (replayed headers)', async () => {
    const original = eventBody('email.delivered');
    const replayed = eventBody('email.bounced', { bounce: { type: 'Permanent' } });
    const { store, applied, disabled } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(original), rawBody: replayed, secret: SECRET, store, now: () => NOW_MS });
    assert.equal(result.status, 401);
    assert.equal(applied.length, 0);
    assert.equal(disabled.length, 0);
  });

  it('answers 503 and records the miss when no secret is configured', async () => {
    const body = eventBody('email.delivered');
    const { store, applied, receipts } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: undefined, store, now: () => NOW_MS });
    assert.equal(result.status, 503);
    assert.equal(applied.length, 0);
    assert.equal(receipts[0].httpStatusCode, 503);
  });

  it('turns off notification updates on a permanent bounce and records a diagnostic', async () => {
    const body = eventBody('email.bounced', { bounce: { type: 'Permanent', subType: 'General', message: 'mailbox does not exist' } });
    const { store, applied, disabled, diagnostics } = fakeStore({ userId: 'user-7' });
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, event: 'bounced', matched: true, notificationsDisabled: 1 });
    assert.equal(applied[0].bounceType, 'Permanent');
    assert.deepEqual(disabled, [{ userId: 'user-7', recipients: ['Member@Example.org'] }]);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].status, 'error');
    assert.match(diagnostics[0].summary, /Hard bounce/);
  });

  it('records a transient bounce without muting anyone', async () => {
    const body = eventBody('email.bounced', { bounce: { type: 'Transient', subType: 'MailboxFull' } });
    const { store, applied, disabled, diagnostics } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.equal(applied[0].event, 'bounced');
    assert.equal(disabled.length, 0);
    assert.equal(diagnostics.length, 0);
  });

  it('turns off notification updates on a spam complaint even when no send-log row matched', async () => {
    const body = eventBody('email.complained');
    const { store, disabled } = fakeStore({ matched: false, userId: null });
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, event: 'complained', matched: false, notificationsDisabled: 1 });
    assert.deepEqual(disabled, [{ userId: null, recipients: ['Member@Example.org'] }]);
  });

  it('acknowledges non-email events without writing anything', async () => {
    const body = JSON.stringify({ type: 'domain.updated', created_at: '2026-09-20T17:59:30.000Z', data: { id: 'dom_1' } });
    const { store, applied, disabled } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, ignored: true, type: 'domain.updated' });
    assert.equal(applied.length, 0);
    assert.equal(disabled.length, 0);
  });

  it('rejects malformed JSON after a valid signature with 400', async () => {
    const body = '{not json';
    const { store, applied } = fakeStore();
    const result = await handleResendWebhook({ headers: signedHeaders(body), rawBody: body, secret: SECRET, store, now: () => NOW_MS });
    assert.equal(result.status, 400);
    assert.equal(applied.length, 0);
  });
});

describe('parseResendEvent / isHardDeliveryFailure', () => {
  it('reads recipients, bounce type and timestamp defensively', () => {
    const parsed = parseResendEvent(JSON.parse(eventBody('email.bounced', { to: 'single@example.org', bounce: { type: 'Undetermined' } })), NOW_MS);
    assert.ok(parsed);
    assert.equal(parsed.event, 'bounced');
    assert.deepEqual(parsed.recipients, ['single@example.org']);
    assert.equal(parsed.bounceType, 'Undetermined');
    assert.equal(isHardDeliveryFailure('bounced', 'Undetermined'), false);
    assert.equal(isHardDeliveryFailure('bounced', 'permanent'), true);
    assert.equal(isHardDeliveryFailure('complained', null), true);
    assert.equal(isHardDeliveryFailure('delivered', 'Permanent'), false);
    assert.equal(parseResendEvent({ data: {} }, NOW_MS), null);
  });
});
