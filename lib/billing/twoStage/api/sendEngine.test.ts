import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RecipientRole } from '../recipients';
import type { SendStatus } from '../sendClaims';
import { classifySend, runSend, type EmailPort, type EmailMessage, type SendClaimRow, type SendStorePort } from './sendEngine';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const RECORD = 'rec-j6-1';
const recipients = [
  { role: 'finance' as const, name: 'Synthetic Finance', email: 'finance@example.test' },
  { role: 'counselor' as const, name: 'Synthetic Counselor', email: 'counselor@example.test' },
  { role: 'student' as const, name: 'Synthetic Student', email: 'student@example.test' },
];

class FakeResolvedError extends Error {
  constructor(readonly statusCode: number | null) {
    super('provider error');
  }
}
class FakeSkipped extends Error {}

/** In-memory ledger with the database's compare-and-set semantics. */
function fakeStore(initial: Array<Partial<SendClaimRow> & { role: RecipientRole; attemptNo: number; status: SendStatus }> = []) {
  let seq = 0;
  const rows: SendClaimRow[] = initial.map((r) => ({
    id: `s-${++seq}`,
    claimToken: `t-${seq}`,
    claimedAt: new Date(NOW.getTime() - 60_000),
    lastClaimedAt: new Date(NOW.getTime() - 60_000),
    idempotencyKey: `billing-two-stage:j6:${RECORD}:v1:a${r.attemptNo}:${r.role}`,
    providerMessageId: null,
    ...r,
  }));
  const audits: unknown[] = [];
  const store: SendStorePort = {
    async listClaims() {
      return rows.map((r) => ({ ...r }));
    },
    async markStaleAmbiguous(row) {
      const r = rows.find((x) => x.id === row.id);
      if (!r || r.claimToken !== row.claimToken || r.status !== 'pending') return false;
      r.status = 'ambiguous';
      return true;
    },
    async insertClaim(input) {
      if (rows.some((r) => r.role === input.role && r.attemptNo === input.attemptNo)) return 'conflict';
      const row: SendClaimRow = { id: `s-${++seq}`, role: input.role, attemptNo: input.attemptNo, status: 'pending', claimToken: `t-${seq}`, claimedAt: NOW, lastClaimedAt: NOW, idempotencyKey: input.idempotencyKey, providerMessageId: null };
      rows.push(row);
      return { ...row };
    },
    async reclaimSameKey(row) {
      const r = rows.find((x) => x.id === row.id);
      if (!r || r.claimToken !== row.claimToken || r.status !== 'ambiguous') return 'lost';
      r.status = 'pending';
      r.claimToken = `t-${++seq}`;
      return { ...r };
    },
    async settle(row, input) {
      const r = rows.find((x) => x.id === row.id);
      if (!r || r.claimToken !== row.claimToken || r.status !== row.status) return false;
      r.status = input.status;
      r.providerMessageId = input.providerMessageId;
      return true;
    },
    async auditAttempt(input) {
      audits.push(input);
    },
  };
  return { store, rows, audits };
}

function fakeEmail(results: Record<string, () => Promise<{ data?: { id?: string | null } | null }>>) {
  const calls: EmailMessage[] = [];
  const email: EmailPort = {
    async send(message) {
      calls.push(message);
      const role = recipients.find((r) => r.email === message.to)!.role;
      return (results[role] ?? (async () => ({ data: { id: `re_${role}` } })))();
    },
    readStatus: (e) => (e instanceof FakeResolvedError ? e.statusCode : undefined),
    isSkippedBeforeProvider: (e) => e instanceof FakeSkipped,
  };
  return { email, calls };
}

const messageFor = () => ({ subject: 'J6 Invoice / Voucher Cover Letter WAP-I-2026-0001', html: '<p>x</p>', text: 'x', attachments: [{ filename: 'a.pdf', content: new Uint8Array([37, 80, 68, 70, 45]) }] });

function run(store: SendStorePort, email: EmailPort, retryFailedRoles: RecipientRole[] = []) {
  return runSend({ stage: 'j6', recordId: RECORD, version: 1, recipients, messageFor, retryFailedRoles, now: NOW, store, email });
}

describe('two-stage send engine (fakes only; no provider)', () => {
  it('sends one copy per role to its frozen address with the canonical per-role key', async () => {
    const { store, rows } = fakeStore();
    const { email, calls } = fakeEmail({});
    const out = await run(store, email);
    assert.deepEqual(out.map((o) => o.outcome), ['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    assert.deepEqual(calls.map((c) => c.to), ['finance@example.test', 'counselor@example.test', 'student@example.test']);
    assert.deepEqual(calls.map((c) => c.idempotencyKey), ['finance', 'counselor', 'student'].map((r) => `billing-two-stage:j6:${RECORD}:v1:a1:${r}`));
    assert.ok(rows.every((r) => r.status === 'provider_accepted' && r.providerMessageId));
  });

  it('finance-only retry: a failed finance copy gets attempt 2 with a fresh key only when requested; accepted roles are never re-sent', async () => {
    const seed = [
      { role: 'finance' as const, attemptNo: 1, status: 'failed' as const },
      { role: 'counselor' as const, attemptNo: 1, status: 'provider_accepted' as const, providerMessageId: 're_c' },
      { role: 'student' as const, attemptNo: 1, status: 'provider_accepted' as const, providerMessageId: 're_s' },
    ];
    const first = fakeStore(seed);
    const e1 = fakeEmail({});
    const notRequested = await run(first.store, e1.email);
    assert.deepEqual(notRequested.map((o) => o.outcome), ['FAILED_RETRY_NOT_REQUESTED', 'ALREADY_ACCEPTED', 'ALREADY_ACCEPTED']);
    assert.equal(e1.calls.length, 0);

    const second = fakeStore(seed);
    const e2 = fakeEmail({});
    const retried = await run(second.store, e2.email, ['finance']);
    assert.deepEqual(retried.map((o) => o.outcome), ['ACCEPTED', 'ALREADY_ACCEPTED', 'ALREADY_ACCEPTED']);
    assert.equal(e2.calls.length, 1);
    assert.equal(e2.calls[0].to, 'finance@example.test');
    assert.equal(e2.calls[0].idempotencyKey, `billing-two-stage:j6:${RECORD}:v1:a2:finance`);
    assert.equal(retried[0].attemptNo, 2);
  });

  it('holds an ambiguous claim: a fresh pending claim is in flight (no call); a stale one is marked ambiguous and retried with the same key', async () => {
    const fresh = fakeStore([{ role: 'finance', attemptNo: 1, status: 'pending', lastClaimedAt: new Date(NOW.getTime() - 5 * 60_000) }]);
    const e1 = fakeEmail({});
    const out1 = await run(fresh.store, e1.email);
    assert.equal(out1[0].outcome, 'IN_FLIGHT');
    assert.equal(e1.calls.filter((c) => c.to === 'finance@example.test').length, 0);
    assert.equal(fresh.rows[0].status, 'pending');

    const stale = fakeStore([{ role: 'finance', attemptNo: 1, status: 'pending', claimedAt: new Date(NOW.getTime() - 20 * 60_000), lastClaimedAt: new Date(NOW.getTime() - 20 * 60_000) }]);
    const e2 = fakeEmail({});
    const out2 = await run(stale.store, e2.email);
    assert.equal(out2[0].outcome, 'ACCEPTED');
    const financeCalls = e2.calls.filter((c) => c.to === 'finance@example.test');
    assert.equal(financeCalls.length, 1);
    assert.equal(financeCalls[0].idempotencyKey, `billing-two-stage:j6:${RECORD}:v1:a1:finance`, 'same key, never a fresh attempt');
    assert.equal(stale.rows.filter((r) => r.role === 'finance').length, 1);
  });

  it('past the 23 h window an ambiguous claim needs reconciliation and is never re-sent', async () => {
    const old = new Date(NOW.getTime() - 24 * 60 * 60_000);
    const { store, rows } = fakeStore([{ role: 'finance', attemptNo: 1, status: 'ambiguous', claimedAt: old, lastClaimedAt: old }]);
    const { email, calls } = fakeEmail({});
    const out = await run(store, email);
    assert.equal(out[0].outcome, 'NEEDS_RECONCILIATION');
    assert.equal(rows[0].status, 'needs_reconciliation');
    assert.equal(calls.filter((c) => c.to === 'finance@example.test').length, 0);
  });

  it('treats a missing data.id, statusCode null and a plain Error as ambiguous; 409 as needs_reconciliation; a definite 4xx as failed; a wrapper skip as failed', async () => {
    const { store, rows } = fakeStore();
    const { email } = fakeEmail({
      finance: async () => ({ data: null }),
      counselor: async () => {
        throw new FakeResolvedError(null);
      },
      student: async () => {
        throw new Error('socket hang up');
      },
    });
    const out = await run(store, email);
    assert.deepEqual(out.map((o) => o.outcome), ['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS']);
    assert.ok(rows.every((r) => r.status === 'ambiguous' && r.providerMessageId === null));
    assert.match(out[0].message, /may or may not have been sent/u);
    assert.doesNotMatch(out.map((o) => o.message).join(' '), /nothing was (signed or )?sent/iu);

    const cls = (error: unknown) => classifySend(email, { ok: false, error }).status;
    assert.equal(cls(new FakeResolvedError(409)), 'needs_reconciliation');
    assert.equal(cls(new FakeResolvedError(422)), 'failed');
    assert.equal(cls(new FakeResolvedError(429)), 'ambiguous');
    assert.equal(cls(new FakeResolvedError(503)), 'ambiguous');
    assert.equal(cls(new FakeSkipped()), 'failed');
    assert.equal(classifySend(email, { ok: true, value: { data: { id: '' } } }).status, 'ambiguous');
  });

  it('a result that cannot be written after the provider call is reported as ambiguous, not as sent or not sent', async () => {
    const { store } = fakeStore();
    const broken: SendStorePort = { ...store, settle: async () => { throw new Error('db down'); } };
    const { email } = fakeEmail({});
    const out = await run(broken, email);
    assert.ok(out.every((o) => o.outcome === 'AMBIGUOUS' && o.status === 'pending'));
  });

  it('a concurrent claim (unique attempt) is in flight and makes no provider call', async () => {
    const { store } = fakeStore();
    const racing: SendStorePort = { ...store, insertClaim: async () => 'conflict' };
    const { email, calls } = fakeEmail({});
    const out = await run(racing, email);
    assert.ok(out.every((o) => o.outcome === 'IN_FLIGHT'));
    assert.equal(calls.length, 0);
  });
});
