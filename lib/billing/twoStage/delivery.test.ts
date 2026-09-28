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
import { assertSendMatchesSnapshot } from './recipients';
import { letterheadConfirmedForExternalSend } from './letterhead';
import {
  IDEMPOTENCY_SAFE_RETRY_MS,
  IN_FLIGHT_GRACE_MS,
  RECONCILE_CLAIMED_MIN_AGE_MS,
  classifyProviderOutcome,
  markStaleClaimAmbiguous,
  decideClaim,
  deliveryState,
  reconcileSend,
  sendIdempotencyKey,
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

  it('claims once, skips delivered copies and never re-sends them', () => {
    assert.deepEqual(decideClaim(null, t0), { action: 'claim_new' });
    assert.deepEqual(decideClaim(row('sent'), t0), { action: 'skip_delivered' });
    assert.deepEqual(decideClaim(row('reconciled_delivered'), t0), { action: 'skip_delivered' });
    assert.deepEqual(decideClaim(row('claimed', 1000), t0), { action: 'in_flight' });
  });

  it('retries an ambiguous or stale claim with the same key inside the window, then needs reconciliation', () => {
    assert.deepEqual(decideClaim(row('ambiguous', 60_000), t0), { action: 'retry_same_key' });
    assert.deepEqual(decideClaim(row('claimed', IN_FLIGHT_GRACE_MS + 1), t0), { action: 'retry_same_key' });
    assert.deepEqual(decideClaim(row('ambiguous', IDEMPOTENCY_SAFE_RETRY_MS + 1), t0), { action: 'needs_reconciliation' });
    assert.deepEqual(decideClaim(row('needs_reconciliation'), t0), { action: 'needs_reconciliation' });
    assert.deepEqual(decideClaim(row('rejected_definite'), t0), { action: 'new_attempt_required' });
  });

  it('classifies provider outcomes; unknowns are ambiguous, key conflicts need a person', () => {
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: 'msg-1' }), 'sent');
    assert.equal(classifyProviderOutcome({ kind: 'accepted', messageId: '' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'timeout' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'network_error' }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 503 }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 429 }), 'ambiguous');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 409 }), 'needs_reconciliation');
    assert.equal(classifyProviderOutcome({ kind: 'http_error', status: 422 }), 'rejected_definite');
  });

  it('reconciliation needs who and a note, and only settles unknown copies', () => {
    const by = { bySubjectId: 'staff-1', note: 'Synthetic provider log shows delivery' };
    assert.deepEqual(reconcileSend(row('needs_reconciliation'), { outcome: 'delivered', ...by }, t0), { ok: true, status: 'reconciled_delivered' });
    assert.deepEqual(reconcileSend(row('ambiguous'), { outcome: 'not_delivered', ...by }, t0), { ok: true, status: 'reconciled_not_delivered' });
    assert.equal(reconcileSend(row('needs_reconciliation'), { outcome: 'delivered', bySubjectId: 'staff-1', note: ' ' }, t0).ok, false);
    assert.equal(reconcileSend(row('sent'), { outcome: 'not_delivered', ...by }, t0).ok, false);
    assert.equal(reconcileSend(row('claimed', 60_000), { outcome: 'delivered', ...by }, t0).ok, false);
    // Even a stale claim is not reconciled directly: it becomes ambiguous first.
    assert.equal(reconcileSend(row('claimed', RECONCILE_CLAIMED_MIN_AGE_MS + 1), { outcome: 'delivered', ...by }, t0).ok, false);
    assert.equal(markStaleClaimAmbiguous(row('claimed', RECONCILE_CLAIMED_MIN_AGE_MS + 1), t0), 'ambiguous');
    assert.equal(markStaleClaimAmbiguous(row('claimed', 1000), t0), null);
  });

  it('a stage is sent only when its exact recipient set (2 for J5, 3 for J6) is delivered', () => {
    const j5 = deliveryState('j5', [{ role: 'counselor', status: 'sent' }, { role: 'student', status: 'ambiguous' }]);
    assert.deepEqual([j5.expected, j5.delivered, j5.unsettled, j5.complete], [['counselor', 'student'], ['counselor'], ['student'], false]);
    assert.equal(deliveryState('j5', [{ role: 'counselor', status: 'sent' }, { role: 'student', status: 'reconciled_delivered' }]).complete, true);
    const j6 = deliveryState('j6', [{ role: 'finance', status: 'sent' }, { role: 'counselor', status: 'sent' }]);
    assert.deepEqual([j6.expected.length, j6.missing, j6.complete], [3, ['student'], false]);
    assert.throws(() => deliveryState('j5', [{ role: 'finance', status: 'sent' }]));
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
    assert.equal(financeBucketName({ BILLING_FINANCE_BUCKET: 'billing-finance-demo' }), 'billing-finance-demo');
    for (const bad of ['member-files', 'member-resumes', 'employer-logos', 'Bad Name', '../x']) {
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
  });
});

describe('letterhead external-send gate', () => {
  it('refuses external sends until BILLING_LETTERHEAD_CONFIRMED=true', () => {
    assert.equal(letterheadConfirmedForExternalSend({}).ok, false);
    assert.equal(letterheadConfirmedForExternalSend({ BILLING_LETTERHEAD_CONFIRMED: 'yes' }).ok, false);
    assert.equal(letterheadConfirmedForExternalSend({ BILLING_LETTERHEAD_CONFIRMED: 'true' }).ok, true);
  });
});
