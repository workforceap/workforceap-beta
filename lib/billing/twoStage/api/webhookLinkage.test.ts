import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { billingDeliveryLinker, type BillingDeliveryDb } from '@/lib/billing/twoStage/api/webhookLinkage';
import { handleResendWebhook, type ResendWebhookStore } from '@/lib/email/resendWebhook';
import { signSvixPayload } from '@/lib/email/webhookSignature';

const SECRET = `whsec_${Buffer.from('a-32-byte-test-secret-for-resend').toString('base64')}`;
const NOW_MS = Date.parse('2026-09-28T18:00:00.000Z');
const GATE_OPEN = { BILLING_TWO_STAGE_MIGRATION_APPLIED: 'true' };
const GATE_CLOSED = {};

function fakeDb(sends: Array<{ id: string; organizationId: string }>, createError: unknown = null) {
  const calls = { findMany: [] as unknown[], create: [] as unknown[] };
  const db: BillingDeliveryDb = {
    billingStageSend: {
      async findMany(args) {
        calls.findMany.push(args);
        return sends;
      },
    },
    billingDeliveryEvent: {
      async create(args) {
        calls.create.push(args);
        if (createError) throw createError;
        return {};
      },
    },
  };
  return { db, calls };
}

const INPUT = { providerMessageId: 're_1', kind: 'delivered' as const, occurredAt: new Date('2026-09-28T17:59:30.000Z'), providerEventId: 'msg_1' };

describe('billingDeliveryLinker', () => {
  it('never reads the database while the migration gate is closed', async () => {
    const { db, calls } = fakeDb([{ id: 'send-1', organizationId: 'org-1' }]);
    assert.deepEqual(await billingDeliveryLinker(db, GATE_CLOSED)(INPUT), { matched: false });
    assert.deepEqual(calls, { findMany: [], create: [] });
  });

  it('reports no match and writes nothing for a message id that is not a billing send', async () => {
    const { db, calls } = fakeDb([]);
    assert.deepEqual(await billingDeliveryLinker(db, GATE_OPEN)(INPUT), { matched: false });
    assert.equal(calls.findMany.length, 1);
    assert.equal(calls.create.length, 0);
  });

  it('ignores a message id that matches more than one accepted send', async () => {
    const { db, calls } = fakeDb([{ id: 'a', organizationId: 'org-1' }, { id: 'b', organizationId: 'org-1' }]);
    assert.deepEqual(await billingDeliveryLinker(db, GATE_OPEN)(INPUT), { matched: false });
    assert.equal(calls.create.length, 0);
  });

  it('records the event for the one accepted send, and treats a repeated Svix event as a no-op', async () => {
    const { db, calls } = fakeDb([{ id: 'send-1', organizationId: 'org-1' }]);
    assert.deepEqual(await billingDeliveryLinker(db, GATE_OPEN)(INPUT), { matched: true });
    assert.deepEqual(calls.create, [
      { data: { organizationId: 'org-1', sendId: 'send-1', kind: 'delivered', occurredAt: INPUT.occurredAt, source: 'resend_webhook', providerEventId: 'msg_1' } },
    ]);
    const dup = fakeDb([{ id: 'send-1', organizationId: 'org-1' }], Object.assign(new Error('unique'), { code: 'P2002' }));
    assert.deepEqual(await billingDeliveryLinker(dup.db, GATE_OPEN)(INPUT), { matched: true });
    const broken = fakeDb([{ id: 'send-1', organizationId: 'org-1' }], new Error('db down'));
    await assert.rejects(billingDeliveryLinker(broken.db, GATE_OPEN)(INPUT), /db down/u);
  });
});

// ---------------------------------------------------------------------------
// Non-regression of app/api/webhooks/resend for non-billing email: the route's
// store with the real linker produces the same response and the same side
// effects as the pre-M3 store (no billing method), for every event type.

function signed(rawBody: string, id: string) {
  const timestamp = String(Math.floor(NOW_MS / 1_000));
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signSvixPayload(SECRET, id, timestamp, rawBody)}` };
}

const EVENTS: Array<[string, Record<string, unknown>]> = [
  ['email.sent', {}],
  ['email.delivered', {}],
  ['email.delivery_delayed', {}],
  ['email.bounced', { bounce: { type: 'Permanent' } }],
  ['email.bounced', { bounce: { type: 'Transient' } }],
  ['email.complained', {}],
  ['email.opened', {}],
];

function recordingStore(linker?: ResendWebhookStore['applyBillingDeliveryEvent']) {
  const effects: unknown[] = [];
  const s: ResendWebhookStore = {
    async applyEvent(input) {
      effects.push(['applyEvent', input]);
      return { matched: true, userId: 'member-user' };
    },
    async disableNotifications(input) {
      effects.push(['disableNotifications', input]);
      return 1;
    },
    async logReceipt(input) {
      effects.push(['logReceipt', input]);
    },
    async recordDiagnostic(input) {
      effects.push(['recordDiagnostic', input]);
    },
    ...(linker ? { applyBillingDeliveryEvent: linker } : {}),
  };
  return { s, effects };
}

describe('Resend webhook route store: non-billing events behave as before M3', () => {
  for (const [gateName, env] of [['migration gate closed', GATE_CLOSED], ['migration gate open, no billing send matches', GATE_OPEN]] as const) {
    it(`same response and side effects as the pre-M3 store (${gateName})`, async () => {
      for (const [i, [type, data]] of EVENTS.entries()) {
        const raw = JSON.stringify({ type, created_at: '2026-09-28T17:59:30.000Z', data: { email_id: 're_general_1', to: ['member@example.test'], ...data } });
        const svixId = `msg_general_${i}`;
        const before = recordingStore();
        const { db } = fakeDb([]);
        const after = recordingStore(billingDeliveryLinker(db, env));
        const r1 = await handleResendWebhook({ headers: signed(raw, svixId), rawBody: raw, secret: SECRET, store: before.s, now: () => NOW_MS });
        const r2 = await handleResendWebhook({ headers: signed(raw, svixId), rawBody: raw, secret: SECRET, store: after.s, now: () => NOW_MS });
        assert.equal(r1.status, 200);
        assert.deepEqual(r2, r1, `${type} ${JSON.stringify(data)}`);
        assert.deepEqual(after.effects, before.effects, `${type} ${JSON.stringify(data)}`);
      }
    });
  }
});
