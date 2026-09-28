import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MEMBER_STORAGE_PREFIXES, deleteUserStorageObjects, type MemberStorageAdmin } from '@/lib/gdpr/deleteUserStorage';
import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';
import { checkBillingProviderOrg, getBillingProviderOrgId } from '../providerOrg';
import { stageAttachments, type ArchivedFile } from './attachments';
import {
  DEFAULT_FINANCE_BUCKET,
  FINANCE_STORAGE_UNAVAILABLE,
  financeBucketName,
  financeObjectKey,
  preflightFinanceStorage,
  validateFinanceUpload,
} from './financeStorage';
import { canTrackPayment, casePaymentView, expectedFollowUpWindow, paymentView, pendingOnJ6Sent, recordPaymentReceived } from './payment';
import { assertSendMatchesSnapshot, isPlausibleEmail, normalizeEmail, normalizeRecipientName } from './recipients';
import { letterheadConfirmedForExternalSend } from './letterhead';
import {
  IDEMPOTENCY_SAFE_RETRY_MS,
  IN_FLIGHT_GRACE_MS,
  RECONCILE_CLAIMED_MIN_AGE_MS,
  classifyProviderOutcome,
  markStaleClaimAmbiguous,
  outcomeFromThrown,
  rolesThatReceivedEarlierVersions,
  recordDeliveryEvidence,
  decideClaim,
  deliveryState,
  reconcileSend,
  sendIdempotencyKey,
  DELIVERY_EVENT_KINDS,
  SEND_STATUSES,
  type ClaimRow,
  type SendRow,
} from './sendClaims';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pdf = (text: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${text}\n%%EOF`, 'utf8'));
const file = (kind: ArchivedFile['kind'], text: string): ArchivedFile => {
  const bytes = pdf(text);
  return { kind, fileName: `${kind}.pdf`, sha256: sha(bytes), byteLength: bytes.byteLength, bytes };
};

describe('idempotency keys are stage- and version-qualified', () => {
  it('a J5 retry and a J6 send can never share a key', () => {
    const j5 = sendIdempotencyKey({ stage: 'j5', recordId: 'rec-1', version: 1, attemptNo: 1, role: 'student' });
    const j6 = sendIdempotencyKey({ stage: 'j6', recordId: 'rec-1', version: 1, attemptNo: 1, role: 'student' });
    const v2 = sendIdempotencyKey({ stage: 'j5', recordId: 'rec-1', version: 2, attemptNo: 1, role: 'student' });
    assert.equal(j5, 'billing-two-stage:j5:rec-1:v1:a1:student');
    assert.equal(new Set([j5, j6, v2]).size, 3);
    assert.throws(() => sendIdempotencyKey({ stage: 'j5', recordId: 'rec-1', version: 1, attemptNo: 1, role: 'finance' }));
  });
});

describe('per-recipient claims: no double sends, unknown outcomes reconciled', () => {
  const t0 = new Date('2026-10-20T15:00:00Z');
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const row = (status: SendRow['status'], claimedAgoMs = 0, lastAgoMs = claimedAgoMs): SendRow => ({ role: 'student', status, claimedAt: at(-claimedAgoMs), lastClaimedAt: at(-lastAgoMs) });

  it('claims once, skips accepted copies and never re-sends them', () => {
    assert.deepEqual(decideClaim(null, t0), { action: 'claim_new' });
    assert.deepEqual(decideClaim(row('provider_accepted'), t0), { action: 'skip_delivered' });
    assert.deepEqual(decideClaim(row('reconciled_delivered'), t0), { action: 'skip_delivered' });
    assert.deepEqual(decideClaim(row('pending', 1000), t0), { action: 'in_flight' });
  });

  it('an ambiguous claim is retried with the SAME key inside the window, or held for reconciliation after it', () => {
    assert.deepEqual(decideClaim(row('ambiguous', 60_000), t0), { action: 'retry_same_key' });
    // A pending claim is never retried directly: in flight until 15 min, then marked ambiguous first.
    assert.equal(IN_FLIGHT_GRACE_MS, RECONCILE_CLAIMED_MIN_AGE_MS);
    assert.equal(RECONCILE_CLAIMED_MIN_AGE_MS, 15 * 60 * 1000);
    assert.deepEqual(decideClaim(row('pending', 2 * 60 * 1000 + 1), t0), { action: 'in_flight' });
    assert.deepEqual(decideClaim(row('pending', RECONCILE_CLAIMED_MIN_AGE_MS - 1), t0), { action: 'in_flight' });
    assert.deepEqual(decideClaim(row('pending', RECONCILE_CLAIMED_MIN_AGE_MS), t0), { action: 'mark_ambiguous' });
    assert.equal(markStaleClaimAmbiguous(row('pending', RECONCILE_CLAIMED_MIN_AGE_MS), t0), 'ambiguous');
    assert.deepEqual(decideClaim(row('ambiguous', IDEMPOTENCY_SAFE_RETRY_MS + 1), t0), { action: 'needs_reconciliation' });
    // Boundary shared with the database (now - claimed_at < 23 h): 23 h exactly is past the window.
    assert.equal(IDEMPOTENCY_SAFE_RETRY_MS, 23 * 60 * 60 * 1000);
    assert.deepEqual(decideClaim(row('ambiguous', IDEMPOTENCY_SAFE_RETRY_MS - 1), t0), { action: 'retry_same_key' });
    assert.deepEqual(decideClaim(row('ambiguous', IDEMPOTENCY_SAFE_RETRY_MS), t0), { action: 'needs_reconciliation' });
    assert.deepEqual(decideClaim(row('needs_reconciliation'), t0), { action: 'needs_reconciliation' });
    // Only a definitive failure mints a new attempt (fresh key).
    assert.deepEqual(decideClaim(row('failed'), t0), { action: 'new_attempt_required' });
    assert.deepEqual(decideClaim(row('reconciled_failed'), t0), { action: 'new_attempt_required' });
    const key = { stage: 'j6' as const, recordId: 'j6-1', version: 2, role: 'finance' as const };
    assert.equal(sendIdempotencyKey({ ...key, attemptNo: 1 }), 'billing-two-stage:j6:j6-1:v2:a1:finance');
    assert.notEqual(sendIdempotencyKey({ ...key, attemptNo: 2 }), sendIdempotencyKey({ ...key, attemptNo: 1 }));
  });

  it('classifies provider outcomes; only a message id is acceptance, only a typed status is a definite rejection', () => {
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: 'msg-1' }), 'provider_accepted');
    // The email wrapper can resolve without data.id: uncertain, never accepted.
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: '' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: null }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: undefined }), 'ambiguous');
    // A plain Error thrown by the wrapper lost the HTTP status: ambiguous, never failed.
    assert.equal(classifyProviderOutcome({ kind: 'thrown', error: new Error('Resend error: invalid recipient') }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'thrown', error: 'unknown' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'timeout' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'network_error' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 503 }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 429 }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: Number.NaN }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 409 }), 'needs_reconciliation');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 422 }), 'failed');
  });

  it('a typed, status-preserving thrown error can be definitive; a plain Error or missing status never is', () => {
    // Local stand-in for the email wrapper's future typed error (M3 plugs in the real export).
    class FakeTypedProviderError extends Error {
      constructor(readonly status: number) {
        super(`synthetic provider error ${status}`);
      }
    }
    const readStatus = (e: unknown) => (e instanceof FakeTypedProviderError ? e.status : undefined);
    const classify = (e: unknown, reader: typeof readStatus | undefined = readStatus) => classifyProviderOutcome(outcomeFromThrown(e, reader));
    for (const status of [400, 401, 403, 404, 422]) assert.equal(classify(new FakeTypedProviderError(status)), 'failed', String(status));
    for (const status of [408, 429, 500, 502, 503]) assert.equal(classify(new FakeTypedProviderError(status)), 'ambiguous', String(status));
    assert.equal(classify(new FakeTypedProviderError(409)), 'needs_reconciliation');
    // A plain Error (what the wrapper throws today) and anything without a status stay ambiguous.
    assert.equal(classify(new Error('Resend error: 422 invalid recipient')), 'ambiguous');
    assert.equal(classify(Object.assign(new Error('duck-typed'), { status: 422 })), 'ambiguous');
    assert.equal(classifyProviderOutcome(outcomeFromThrown(new FakeTypedProviderError(422))), 'ambiguous', 'no status reader: ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'thrown', error: new Error('x'), status: null }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'thrown', error: new Error('x'), status: 422 }), 'failed');
  });

  it('a returned provider error without an explicit status is ambiguous, whatever its name says', () => {
    // Resend SDK v4.8.0 returns { name, message } with no status, and turns fetch failures into application_error.
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'validation_error', message: 'Invalid `to` field' }, status: null }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'validation_error' }, status: undefined }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'application_error', message: 'fetch failed' }, status: null }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'not_found', message: '404' }, status: null }), 'ambiguous');
    // Only an explicitly supplied status decides.
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'validation_error' }, status: 422 }), 'failed');
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'rate_limit_exceeded' }, status: 429 }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'provider_error', error: { name: 'validation_error' }, status: 408 }), 'ambiguous');
  });

  it('the TS status and evidence unions are the stored values (the PG16 proof checks the SQL side)', () => {
    assert.deepEqual([...SEND_STATUSES], ['pending', 'provider_accepted', 'ambiguous', 'needs_reconciliation', 'failed', 'reconciled_delivered', 'reconciled_failed']);
    assert.deepEqual([...DELIVERY_EVENT_KINDS], ['delivered', 'bounced', 'complained']);
  });

  it('reconciliation needs who and a note, and only settles unknown copies', () => {
    const by = { bySubjectId: 'staff-1', note: 'Synthetic provider log shows delivery' };
    assert.deepEqual(reconcileSend(row('needs_reconciliation'), { outcome: 'delivered', ...by }), { ok: true, status: 'reconciled_delivered' });
    assert.deepEqual(reconcileSend(row('ambiguous'), { outcome: 'not_delivered', ...by }), { ok: true, status: 'reconciled_failed' });
    assert.equal(reconcileSend(row('needs_reconciliation'), { outcome: 'delivered', bySubjectId: 'staff-1', note: ' ' }).ok, false);
    assert.equal(reconcileSend(row('provider_accepted'), { outcome: 'not_delivered', ...by }).ok, false);
    assert.equal(reconcileSend(row('pending', 60_000), { outcome: 'delivered', ...by }).ok, false);
    // Even a stale claim is not reconciled directly: it becomes ambiguous first.
    assert.equal(reconcileSend(row('pending', RECONCILE_CLAIMED_MIN_AGE_MS + 1), { outcome: 'delivered', ...by }).ok, false);
    assert.equal(markStaleClaimAmbiguous(row('pending', RECONCILE_CLAIMED_MIN_AGE_MS + 1), t0), 'ambiguous');
    assert.equal(markStaleClaimAmbiguous(row('pending', 1000), t0), null);
  });
});

describe('per-role completion (mirrors the migration sent invariant)', () => {
  const CONTENT = 'a'.repeat(64);
  const FILES = ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)];
  const snapshot = [
    { role: 'finance' as const, email: 'finance@example.test' },
    { role: 'counselor' as const, email: 'counselor@example.test' },
    { role: 'student' as const, email: 'student@example.test' },
  ];
  const version = { contentSha256: CONTENT, attachmentSha256s: FILES, snapshot };
  const claim = (role: ClaimRow['role'], status: ClaimRow['status'], attemptNo = 1, over: Partial<ClaimRow> = {}): ClaimRow => ({
    role, status, attemptNo, contentSha256: CONTENT, email: `${role}@example.test`, attachmentSha256s: FILES, ...over,
  });

  it('finance fails definitively while student and counselor are accepted: retry finance only, then the stage completes', () => {
    const rows = [claim('student', 'provider_accepted'), claim('counselor', 'provider_accepted'), claim('finance', 'failed')];
    const before = deliveryState('j6', version, rows);
    assert.equal(before.complete, false);
    assert.deepEqual(before.plan, [
      { role: 'finance', action: 'claim', attemptNo: 2, freshKey: true },
      { role: 'counselor', action: 'accepted', attemptNo: 1 },
      { role: 'student', action: 'accepted', attemptNo: 1 },
    ]);
    const after = deliveryState('j6', version, [...rows, claim('finance', 'provider_accepted', 2)]);
    assert.equal(after.complete, true);
    assert.deepEqual(after.accepted, ['finance', 'counselor', 'student']);
    assert.ok(after.plan.every((p) => p.action === 'accepted'));
  });

  it('an ambiguous finance claim is held: no new attempt and not sent', () => {
    for (const status of ['ambiguous', 'pending', 'needs_reconciliation'] as const) {
      const s = deliveryState('j6', version, [claim('student', 'provider_accepted'), claim('counselor', 'provider_accepted'), claim('finance', status)]);
      assert.equal(s.complete, false, status);
      assert.deepEqual(s.held, ['finance']);
      assert.deepEqual(s.plan.find((p) => p.role === 'finance'), { role: 'finance', action: 'held', attemptNo: 1, status });
    }
    // An unresolved earlier claim keeps the stage open even beside an accepted one.
    const s = deliveryState('j5', { ...version, snapshot: snapshot.slice(1) }, [claim('student', 'provider_accepted'), claim('counselor', 'provider_accepted'), claim('student', 'ambiguous', 2)]);
    assert.equal(s.complete, false);
  });

  it('a claim with the wrong content hash, attachments or address never counts', () => {
    for (const over of [{ contentSha256: 'e'.repeat(64) }, { email: 'finance-typo@example.test' }, { email: 'counselor@example.test' }, { attachmentSha256s: FILES.slice(0, 2) }]) {
      const s = deliveryState('j6', version, [claim('student', 'provider_accepted'), claim('counselor', 'provider_accepted'), claim('finance', 'provider_accepted', 1, over)]);
      assert.equal(s.complete, false, JSON.stringify(over));
      assert.deepEqual(s.accepted, ['counselor', 'student']);
    }
  });

  it('J5 needs exactly counselor and student; other roles are refused', () => {
    const j5 = { ...version, snapshot: snapshot.slice(1) };
    assert.equal(deliveryState('j5', j5, [claim('counselor', 'provider_accepted'), claim('student', 'reconciled_delivered')]).complete, true);
    assert.equal(deliveryState('j5', j5, [claim('counselor', 'provider_accepted')]).complete, false);
    assert.throws(() => deliveryState('j5', j5, [claim('finance', 'provider_accepted')]));
  });

  it('stage sent, then a counselor bounce: the stage stays sent and follow-up is flagged', () => {
    const rows = [claim('student', 'provider_accepted'), claim('counselor', 'provider_accepted'), claim('finance', 'provider_accepted')];
    const s = deliveryState('j6', version, rows, [{ role: 'counselor', kind: 'bounced' }, { role: 'finance', kind: 'delivered' }]);
    assert.equal(s.complete, true);
    assert.deepEqual(s.followUp, ['counselor']);
    const evidence = { kind: 'bounced' as const, at: new Date(), source: 'synthetic webhook', providerEventId: 'evt-1' };
    assert.ok(recordDeliveryEvidence({ status: 'provider_accepted' }, evidence).ok);
    assert.ok(recordDeliveryEvidence({ status: 'reconciled_delivered' }, evidence).ok);
    assert.equal(recordDeliveryEvidence({ status: 'provider_accepted' }, evidence, [{ providerEventId: 'evt-1' }]).ok, false);
    assert.equal(recordDeliveryEvidence({ status: 'ambiguous' }, evidence).ok, false);
    assert.equal(recordDeliveryEvidence({ status: 'failed' }, evidence).ok, false);
    assert.equal(recordDeliveryEvidence({ status: 'provider_accepted' }, { ...evidence, source: ' ' }).ok, false);
  });
});

describe('attachments are the exact archived bytes', () => {
  const j5 = file('j5_signed_pdf', 'synthetic signed J5');
  const j6 = file('j6_signed_pdf', 'synthetic signed J6');
  const voucher = file('board_signed_voucher', 'synthetic board voucher with receiving signature');
  const invoice = file('board_invoice', 'synthetic board invoice');

  it('J5 attaches only its signed PDF', () => {
    const r = stageAttachments('j5', { signed: j5 });
    assert.ok(r.ok);
    assert.deepEqual(r.sha256s, [j5.sha256]);
    assert.equal(stageAttachments('j5', { signed: j5, voucher }).ok, false);
  });

  it('J6 attaches the cover letter, then the uploaded voucher bytes, then the optional invoice, all hash-equal', () => {
    const r = stageAttachments('j6', { signed: j6, voucher, boardInvoice: invoice });
    assert.ok(r.ok);
    assert.deepEqual(r.sha256s, [j6.sha256, voucher.sha256, invoice.sha256]);
    assert.equal(sha(r.attachments[1].content), voucher.sha256);
    assert.deepEqual(Buffer.from(r.attachments[1].content), Buffer.from(voucher.bytes));
    const without = stageAttachments('j6', { signed: j6, voucher });
    assert.ok(without.ok);
    assert.equal(without.attachments.length, 2);
  });

  it('refuses a J6 without the voucher, or any file whose bytes no longer match the archive', () => {
    assert.equal(stageAttachments('j6', { signed: j6 }).ok, false);
    assert.equal(stageAttachments('j6', { signed: j6, voucher: invoice }).ok, false);
    const tampered = { ...voucher, bytes: pdf('synthetic board voucher, stamped') };
    assert.equal(stageAttachments('j6', { signed: j6, voucher: tampered }).ok, false);
  });
});

describe('finance archive storage', () => {
  it('stores an upload byte-for-byte and hashes it on the server', () => {
    const bytes = pdf('synthetic voucher upload');
    const r = validateFinanceUpload({ bytes, fileName: 'C:\\scans\\voucher (signed).pdf' });
    assert.ok(r.ok);
    assert.equal(r.upload.bytes, bytes);
    assert.equal(r.upload.sha256, sha(bytes));
    assert.equal(r.upload.byteLength, bytes.byteLength);
    assert.equal(r.upload.fileName, 'voucher _signed_.pdf');
  });

  it('accepts only non-empty PDFs up to 10 MB', () => {
    assert.equal(validateFinanceUpload({ bytes: new Uint8Array(), fileName: 'x.pdf' }).ok, false);
    assert.equal(validateFinanceUpload({ bytes: new Uint8Array(Buffer.from('\x89PNG\r\n')), fileName: 'x.png' }).ok, false);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(Buffer.from('%PDF-'));
    assert.equal(validateFinanceUpload({ bytes: big, fileName: 'x.pdf' }).ok, false);
  });

  it('builds server-side content-addressed keys outside any member prefix', () => {
    const h = 'a'.repeat(64);
    assert.equal(financeObjectKey('case-1', 'board_signed_voucher', h), `cases/case-1/voucher/${h}.pdf`);
    assert.equal(financeObjectKey('case-1', 'j6_signed_pdf', h), `cases/case-1/j6/${h}.pdf`);
    assert.throws(() => financeObjectKey('../member', 'j5_signed_pdf', h));
    assert.throws(() => financeObjectKey('case-1', 'j5_signed_pdf', 'nothex'));
  });

  it('uses a configurable private bucket and never a member or public bucket', () => {
    assert.equal(financeBucketName({}), DEFAULT_FINANCE_BUCKET);
    assert.equal(DEFAULT_FINANCE_BUCKET, 'billing-finance');
    assert.equal(financeBucketName({ BILLING_FINANCE_BUCKET: 'billing-finance' }), 'billing-finance');
    // Pinned to billing-finance (the DB CHECK and #2704): any other name fails closed.
    for (const bad of ['billing-finance-demo', 'public-billing', 'member-files', 'member-resumes', 'employer-logos', 'Bad Name', '../x']) {
      assert.equal(financeBucketName({ BILLING_FINANCE_BUCKET: bad }), null, bad);
    }
  });

  it('preflight fails closed unless the bucket exists and is private', async () => {
    const client = (data: { public?: boolean } | null, error: { message: string } | null = null) => ({ storage: { getBucket: async () => ({ data, error }) } });
    assert.deepEqual(await preflightFinanceStorage(client({ public: false }), {}), { ok: true, bucket: 'billing-finance' });
    for (const [c, code] of [
      [client(null, { message: 'Bucket not found' }), 'missing'],
      [client({ public: true }), 'public'],
      [client({}), 'public'],
      [{ storage: { getBucket: async () => { throw new Error('network'); } } }, 'unreachable'],
    ] as const) {
      const r = await preflightFinanceStorage(c, {});
      assert.equal(!r.ok && r.code, code);
      assert.equal(!r.ok && r.message, FINANCE_STORAGE_UNAVAILABLE);
    }
    const mis = await preflightFinanceStorage(client({ public: false }), { BILLING_FINANCE_BUCKET: 'member-files' });
    assert.equal(!mis.ok && mis.code, 'misconfigured');
  });

  it('account erasure (deleteUserStorage) never lists or removes anything in the finance bucket', async () => {
    const touched: string[] = [];
    const admin: MemberStorageAdmin = {
      storage: {
        from: (bucket: string) => {
          touched.push(bucket);
          return { list: async () => ({ data: [], error: null }), remove: async () => ({ data: null, error: null }) };
        },
      },
    };
    const result = await deleteUserStorageObjects('member-synthetic', {
      supabaseAdmin: admin,
      extraPaths: [{ bucket: DEFAULT_FINANCE_BUCKET, path: 'cases/case-1/voucher/abc.pdf' }],
    });
    assert.ok(result.ok);
    assert.ok(touched.length > 0);
    assert.ok(!touched.includes(DEFAULT_FINANCE_BUCKET), `touched ${touched.join(', ')}`);
    assert.ok(MEMBER_STORAGE_PREFIXES.every((p) => (p.bucket as string) !== DEFAULT_FINANCE_BUCKET));
  });
});

describe('payment tracking', () => {
  const sentAt = new Date('2026-10-01T15:00:00Z');

  it('anchors the window to the America/Chicago send date at the midnight boundaries (the PG16 proof checks SQL parity)', () => {
    // CDT (UTC-5): 04:59Z is still the previous Chicago day, 05:00Z is the new one.
    assert.deepEqual(expectedFollowUpWindow(new Date('2026-10-02T04:59:00Z')), { expectedFollowUpFrom: '2026-10-11', expectedFollowUpTo: '2026-10-15' });
    assert.deepEqual(expectedFollowUpWindow(new Date('2026-10-02T05:00:00Z')), { expectedFollowUpFrom: '2026-10-12', expectedFollowUpTo: '2026-10-16' });
    // CST (UTC-6) after the November change.
    assert.deepEqual(expectedFollowUpWindow(new Date('2026-12-02T05:59:00Z')), { expectedFollowUpFrom: '2026-12-11', expectedFollowUpTo: '2026-12-15' });
    assert.deepEqual(expectedFollowUpWindow(new Date('2026-12-02T06:00:00Z')), { expectedFollowUpFrom: '2026-12-12', expectedFollowUpTo: '2026-12-16' });
  });

  it('pending carries an expected follow-up window of send + 10 to + 14 days', () => {
    assert.deepEqual(expectedFollowUpWindow(sentAt), { expectedFollowUpFrom: '2026-10-11', expectedFollowUpTo: '2026-10-15' });
    // Sent late evening in Texas (after midnight UTC): the Texas send date counts.
    assert.deepEqual(expectedFollowUpWindow(new Date('2026-10-02T03:00:00Z')), { expectedFollowUpFrom: '2026-10-11', expectedFollowUpTo: '2026-10-15' });
    const pending = pendingOnJ6Sent(sentAt);
    assert.equal(pending.status, 'pending');
    assert.ok(!('dueDate' in pending));
  });

  it('never becomes received without a date and evidence, and never by itself', () => {
    const pending = pendingOnJ6Sent(sentAt);
    const now = new Date('2026-10-20T15:00:00Z');
    assert.equal(recordPaymentReceived(null, { receivedOn: '2026-10-12', evidence: 'x', now }).ok, false);
    assert.equal(recordPaymentReceived(pending, { receivedOn: '2026-10-12', evidence: ' ', now }).ok, false);
    assert.equal(recordPaymentReceived(pending, { receivedOn: '2026-10-21', evidence: 'remittance', now }).ok, false);
    const r = recordPaymentReceived(pending, { receivedOn: '2026-10-12', evidence: 'Synthetic remittance advice', now });
    assert.ok(r.ok);
    assert.equal(recordPaymentReceived(r.event, { receivedOn: '2026-10-13', evidence: 'again', now }).ok, false);
    assert.deepEqual(paymentView(r.event, now), { status: 'received', receivedOn: '2026-10-12' });
  });

  it('shows pending as awaiting, then "follow up now"; there is no overdue state', () => {
    const pending = pendingOnJ6Sent(sentAt);
    assert.equal(paymentView(pending, new Date('2026-10-05T15:00:00Z')).status, 'pending');
    assert.equal((paymentView(pending, new Date('2026-10-05T15:00:00Z')) as { followUp: string }).followUp, 'awaiting');
    assert.equal((paymentView(pending, new Date('2026-10-11T15:00:00Z')) as { followUp: string }).followUp, 'follow_up_now');
    assert.equal((paymentView(pending, new Date('2026-12-31T15:00:00Z')) as { followUp: string }).followUp, 'follow_up_now');
    assert.deepEqual(paymentView(null, sentAt), { status: 'not_applicable' });
  });
});

describe('provider-org restriction', () => {
  it('limits issuance to the default WorkforceAP org and fails closed on a bad override', () => {
    assert.equal(getBillingProviderOrgId({}), DEFAULT_ORG_ID);
    assert.deepEqual(checkBillingProviderOrg([DEFAULT_ORG_ID], {}), { ok: true });
    assert.equal(checkBillingProviderOrg(['99999999-9999-4999-8999-999999999999'], {}).ok, false);
    assert.equal(checkBillingProviderOrg([DEFAULT_ORG_ID, null], {}).ok, false);
    assert.equal(checkBillingProviderOrg([], {}).ok, false);
    const bad = checkBillingProviderOrg([DEFAULT_ORG_ID], { BILLING_PACKET_PROVIDER_ORG_ID: 'not-a-uuid' });
    assert.equal(!bad.ok && bad.status, 503);
  });
});

describe('recipient normalization (shared with billing_normalize_email / _name)', () => {
  it('trims ASCII whitespace, lowercases email, collapses whitespace inside names', () => {
    assert.equal(normalizeEmail(' \tStudent@Example.TEST\n'), 'student@example.test');
    assert.equal(normalizeRecipientName('  Ada \t  Lovelace\n'), 'Ada Lovelace');
    assert.equal(normalizeRecipientName('Ada\r\nLovelace'), 'Ada Lovelace');
    // Non-ASCII spaces are not whitespace for either side, and make an email implausible.
    assert.equal(isPlausibleEmail('\u00a0student@example.test'), false);
  });
});

describe('prior-version receipts', () => {
  it('lists which roles received which earlier versions (from accepted_roles_at_close)', () => {
    assert.deepEqual(
      rolesThatReceivedEarlierVersions([
        { version: 2, acceptedRolesAtClose: ['finance', 'student'] },
        { version: 1, acceptedRolesAtClose: ['finance'] },
        { version: 3, acceptedRolesAtClose: [] },
      ]),
      [{ role: 'finance', versions: [1, 2] }, { role: 'student', versions: [2] }],
    );
    assert.deepEqual(rolesThatReceivedEarlierVersions([{ version: 1, acceptedRolesAtClose: null }]), []);
  });
});

describe('recipient snapshot binding (service layer)', () => {
  const j6 = [
    { role: 'finance' as const, email: 'finance@example.test' },
    { role: 'counselor' as const, email: 'counselor@example.test' },
    { role: 'student' as const, email: 'student@example.test' },
  ];
  it('allows a copy only to the frozen address for its role', () => {
    assert.deepEqual(assertSendMatchesSnapshot('j6', j6, { role: 'finance', email: 'finance@example.test' }), { ok: true });
    assert.equal(assertSendMatchesSnapshot('j6', j6, { role: 'finance', email: 'finance-typo@example.test' }).ok, false);
    assert.equal(assertSendMatchesSnapshot('j6', j6, { role: 'student', email: 'counselor@example.test' }).ok, false);
    assert.equal(assertSendMatchesSnapshot('j6', j6, { role: 'student', email: 'Student@Example.test' }).ok, false);
  });
  it('refuses a snapshot that is not exactly the stage roles', () => {
    assert.equal(assertSendMatchesSnapshot('j5', j6, { role: 'student', email: 'student@example.test' }).ok, false);
    assert.equal(assertSendMatchesSnapshot('j6', j6.slice(1), { role: 'student', email: 'student@example.test' }).ok, false);
    assert.equal(assertSendMatchesSnapshot('j6', [...j6.slice(0, 2), { role: 'student', email: ' Student@example.test' }], { role: 'student', email: ' Student@example.test' }).ok, false);
  });
});

describe('payment after the J6 is superseded', () => {
  it('tracks payment for a J6 proven sent, whatever its current status, and never for an unsent J6', () => {
    assert.equal(canTrackPayment({ stage: 'j6', sentAt: '2026-10-01T15:00:00Z', deliveredRoles: ['finance', 'counselor', 'student'] }), true);
    assert.equal(canTrackPayment({ stage: 'j6', sentAt: null, deliveredRoles: ['finance', 'counselor', 'student'] }), false);
    assert.equal(canTrackPayment({ stage: 'j6', sentAt: '2026-10-01T15:00:00Z', deliveredRoles: ['counselor', 'student'] }), false);
    assert.equal(canTrackPayment({ stage: 'j5', sentAt: '2026-10-01T15:00:00Z', deliveredRoles: ['counselor', 'student', 'finance'] }), false);
  });
  it('shows the case-level payment from the latest event across J6 versions', () => {
    const pending = { ...pendingOnJ6Sent(new Date('2026-10-01T15:00:00Z')), j6RecordId: 'j6-v1' };
    const received = { status: 'received' as const, receivedOn: '2026-10-12', evidence: 'Synthetic remittance', recordedAt: '2026-10-12T15:00:00.000Z', j6RecordId: 'j6-v1' };
    assert.deepEqual(casePaymentView([received, pending], new Date('2026-10-20T15:00:00Z')), { status: 'received', receivedOn: '2026-10-12', j6RecordId: 'j6-v1' });
    assert.equal(casePaymentView([], new Date()).status, 'not_applicable');
    // Monotonic: a later pending never regresses a received case.
    const laterPending = { ...pendingOnJ6Sent(new Date('2026-10-20T15:00:00Z')), j6RecordId: 'j6-v2' };
    assert.equal(casePaymentView([pending, received, laterPending], new Date('2026-10-25T15:00:00Z')).status, 'received');
  });
});

describe('letterhead external-send gate', () => {
  it('is retired: the confirmed footer never blocks a send, whatever BILLING_LETTERHEAD_CONFIRMED says', () => {
    assert.equal(letterheadConfirmedForExternalSend({}).ok, true);
    assert.equal(letterheadConfirmedForExternalSend({ BILLING_LETTERHEAD_CONFIRMED: 'false' }).ok, true);
  });
});
