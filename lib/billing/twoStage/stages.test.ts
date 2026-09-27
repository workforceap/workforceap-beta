import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordClassStarted,
  recordExternalJ5Reference,
  recordJ5Readiness,
  recordVoucherBoardSigned,
  type Attestation,
  type AttestationDraft,
} from './attestations';
import { contentSha256 } from './canonical';
import { buildJ5Content, buildJ6Content, formatStageDocumentNumber, type J5Content } from './content';
import { canSignJ6, checkJ5Prerequisites, checkJ6Prerequisites, nextStageStatus, summarizeCase, type J6Prerequisites } from './stateMachine';

const NOW = new Date('2026-10-20T15:00:00Z');
const STAFF = 'staff-synthetic';
const IT_SUPPORT = 'it-support-professional-certificate-ibm';
const AI_SOFTWARE = 'software-developer-professional-certificate-ibm';

const saved = (draft: AttestationDraft, id: string): Attestation => ({ ...draft, id, attestedAt: '2026-10-01T12:00:00.000Z' });
function ok<T>(r: { ok: true; attestation: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.attestation;
}

const readiness = saved(
  ok(recordJ5Readiness({ studentName: 'Synthetic Student', className: 'IT Support', classStartDate: '2026-09-30', evidenceReference: 'synthetic referral #1', attestedBySubjectId: STAFF, confirmed: true })),
  'att-ready',
);
const people = {
  student: { name: 'Synthetic Student', email: 'student@example.test' },
  counselor: { name: 'Synthetic Counselor', email: 'counselor@example.test', phone: '(512) 555-0100' },
  boardName: 'Workforce Solutions Synthetic Area',
};

function sentJ5(programSlug = IT_SUPPORT): { recordId: string; status: 'sent'; content: J5Content; contentSha256: string } {
  const built = buildJ5Content({ documentNumber: 'WAP-Q-2026-0001', issueDate: '2026-09-15', programSlug, readiness, ...people });
  if (!built.ok) throw new Error(built.errors.join('; '));
  return { recordId: 'j5-1', status: 'sent', content: built.content, contentSha256: built.contentSha256 };
}

const voucherArtifact = { id: 'art-voucher', kind: 'board_signed_voucher', fileName: 'voucher.pdf', mimeType: 'application/pdf', byteLength: 1234, sha256: 'b'.repeat(64) };
const classStarted = saved(
  ok(recordClassStarted({ studentName: 'S', className: 'IT Support', classStartDate: '2026-09-30', classEndDate: '2027-02-28', evidenceReference: 'synthetic attendance', attestedBySubjectId: STAFF, confirmed: true, now: NOW })),
  'att-start',
);
const voucherAttestation = (over: Partial<Parameters<typeof recordVoucherBoardSigned>[0]> = {}) =>
  saved(
    ok(
      recordVoucherBoardSigned({
        boardName: people.boardName,
        voucherReference: 'PO-SYN-1',
        artifact: voucherArtifact,
        authorizedAmountCents: 750_000,
        receivedOn: '2026-10-02',
        receivingSignaturePresent: true,
        evidenceReference: 'synthetic board email',
        attestedBySubjectId: STAFF,
        confirmed: true,
        now: NOW,
        ...over,
      }),
    ),
    'att-voucher',
  );

function j6Input(over: Partial<J6Prerequisites> = {}): J6Prerequisites {
  return {
    now: NOW,
    hasOpenJ6: false,
    programSlug: IT_SUPPORT,
    priorJ5: { source: 'system', j5: sentJ5() },
    classStarted,
    voucher: voucherArtifact,
    voucherAttestation: voucherAttestation(),
    boardInvoice: null,
    ...over,
  };
}

describe('J5: allowed before any voucher exists', () => {
  it('needs only the readiness attestation; there is no voucher or funding-approval input', () => {
    assert.deepEqual(checkJ5Prerequisites({ hasOpenJ5: false, readiness, programSlug: IT_SUPPORT }), { ok: true });
    const built = buildJ5Content({ documentNumber: 'WAP-Q-2026-0001', issueDate: '2026-09-15', programSlug: IT_SUPPORT, readiness, ...people });
    assert.ok(built.ok);
    const c = built.content;
    assert.equal(c.title, 'Quote/Voucher Request');
    assert.deepEqual(c.training, { programSlug: IT_SUPPORT, className: 'IT Support Professional Certificate (IBM)', contactHours: 160, classStartDate: '2026-09-30', classEndDate: '2027-02-28' });
    assert.deepEqual(c.lineItems, [{ label: 'Tuition & Fees', amountCents: 750_000 }]);
    assert.equal(c.totalCents, 750_000);
    assert.deepEqual(c.recipients.map((r) => r.role), ['counselor', 'student']);
    assert.equal(c.signer.line, 'Michael A. Brown, PMP, ChE — Executive Director');
    assert.ok(!('voucher' in c) && !('finance' in c));
    assert.doesNotMatch(JSON.stringify(c), /invoice/i);
  });

  it('freezes 200 hours and the clamped end date for the AI & Software program', () => {
    const r = saved(ok(recordJ5Readiness({ studentName: 'S', className: 'AI', classStartDate: '2026-10-31', evidenceReference: 'ref', attestedBySubjectId: STAFF, confirmed: true })), 'r2');
    const built = buildJ5Content({ documentNumber: 'WAP-Q-2026-0002', issueDate: '2026-10-01', programSlug: 'ai-and-software-development-professional-certificate-ibm', readiness: r, ...people });
    assert.ok(built.ok);
    assert.equal(built.content.training.contactHours, 200);
    assert.equal(built.content.training.classEndDate, '2027-03-31');
    assert.equal(built.content.training.programSlug, AI_SOFTWARE);
  });

  it('is refused without a readiness attestation, for an unapproved program, or while a J5 is open', () => {
    assert.equal(checkJ5Prerequisites({ hasOpenJ5: false, readiness: null, programSlug: IT_SUPPORT }).ok, false);
    assert.equal(checkJ5Prerequisites({ hasOpenJ5: false, readiness, programSlug: 'digital-literacy-empowerment-class' }).ok, false);
    assert.equal(checkJ5Prerequisites({ hasOpenJ5: true, readiness, programSlug: IT_SUPPORT }).ok, false);
  });

  it('readiness is an explicit staff attestation with evidence, never inferred', () => {
    const missing = recordJ5Readiness({ studentName: 'S', className: 'C', classStartDate: '2026-09-30', evidenceReference: ' ', attestedBySubjectId: STAFF, confirmed: true });
    assert.equal(missing.ok, false);
    const unconfirmed = recordJ5Readiness({ studentName: 'S', className: 'C', classStartDate: '2026-09-30', evidenceReference: 'ref', attestedBySubjectId: STAFF, confirmed: false });
    assert.equal(unconfirmed.ok, false);
    const noDate = recordJ5Readiness({ studentName: 'S', className: 'C', classStartDate: '', evidenceReference: 'ref', attestedBySubjectId: STAFF, confirmed: true });
    assert.equal(noDate.ok, false);
  });
});

describe('J6: gated on the received signed voucher and class start', () => {
  it('passes with a sent J5, the receipt-signed voucher and a begun class', () => {
    const gate = checkJ6Prerequisites(j6Input());
    assert.ok(gate.ok, !gate.ok ? gate.errors.join('; ') : '');
    assert.deepEqual(gate.reviewReasons, []);
    assert.deepEqual(gate.variance, { startShiftDays: 0, endShiftDays: 0, hoursDelta: 0 });
  });

  it('is blocked without the uploaded voucher or its attestation', () => {
    assert.equal(checkJ6Prerequisites(j6Input({ voucher: null })).ok, false);
    assert.equal(checkJ6Prerequisites(j6Input({ voucherAttestation: null })).ok, false);
    assert.equal(checkJ6Prerequisites(j6Input({ voucher: { ...voucherArtifact, kind: 'board_invoice' } })).ok, false);
    assert.equal(checkJ6Prerequisites(j6Input({ voucherAttestation: { ...voucherAttestation(), artifactId: 'other' } })).ok, false);
  });

  it('is blocked when Michael’s receiving signature is missing or attested false', () => {
    const noSig = recordVoucherBoardSigned({ boardName: 'B', voucherReference: 'PO', artifact: voucherArtifact, authorizedAmountCents: 750_000, receivedOn: '2026-10-02', receivingSignaturePresent: false, evidenceReference: 'e', attestedBySubjectId: STAFF, confirmed: true, now: NOW });
    assert.equal(noSig.ok, false);
    for (const value of [false, null]) {
      const gate = checkJ6Prerequisites(j6Input({ voucherAttestation: { ...voucherAttestation(), receivingSignaturePresent: value } }));
      assert.equal(gate.ok, false);
      assert.match(!gate.ok ? gate.errors.join(' ') : '', /unsigned voucher/);
    }
  });

  it('is blocked until the class has begun (start <= today in Texas)', () => {
    const future = { ...classStarted, classStartDate: '2026-10-21', classEndDate: '2027-03-21' };
    assert.equal(checkJ6Prerequisites(j6Input({ classStarted: future })).ok, false);
    assert.equal(checkJ6Prerequisites(j6Input({ classStarted: null })).ok, false);
    const today = { ...classStarted, classStartDate: '2026-10-20', classEndDate: '2027-03-20' };
    assert.ok(checkJ6Prerequisites(j6Input({ classStarted: today, priorJ5: { source: 'external', attestation: external() } })).ok);
    const refused = recordClassStarted({ studentName: 'S', className: 'C', classStartDate: '2026-10-21', classEndDate: '2027-03-21', evidenceReference: 'e', attestedBySubjectId: STAFF, confirmed: true, now: NOW });
    assert.equal(refused.ok, false);
  });

  it('is held without a prior quote; an unsent J5 does not count', () => {
    const held = checkJ6Prerequisites(j6Input({ priorJ5: null }));
    assert.equal(held.ok, false);
    assert.match(!held.ok ? held.errors.join(' ') : '', /on hold/);
    assert.equal(checkJ6Prerequisites(j6Input({ priorJ5: { source: 'system', j5: { ...sentJ5(), status: 'signed' } } })).ok, false);
  });

  it('accepts an attested external (manual) quote without any system J5', () => {
    const gate = checkJ6Prerequisites(j6Input({ priorJ5: { source: 'external', attestation: external() } }));
    assert.ok(gate.ok);
    assert.deepEqual(gate.priorJ5, { source: 'external', attestationId: 'att-ext', reference: 'MANUAL-Q-17', quoteDate: '2026-08-01', copyArtifactId: null });
    assert.equal(gate.variance, null);
  });

  it('prints actual dates, keeps the J5 estimate unchanged, and reports the variance', () => {
    const j5 = sentJ5();
    const before = JSON.stringify(j5.content);
    const moved = { ...classStarted, classStartDate: '2026-10-05', classEndDate: '2027-03-05' };
    const gate = checkJ6Prerequisites(j6Input({ priorJ5: { source: 'system', j5 }, classStarted: moved }));
    assert.ok(gate.ok);
    assert.equal(gate.training.classStartDate, '2026-10-05');
    assert.equal(gate.training.classEndDate, '2027-03-05');
    assert.deepEqual(gate.variance, { startShiftDays: 5, endShiftDays: 5, hoursDelta: 0 });
    assert.deepEqual(gate.reviewReasons, []);
    assert.equal(JSON.stringify(j5.content), before);
    assert.equal(gate.priorJ5.source === 'system' && gate.priorJ5.estimate.classStartDate, '2026-09-30');
  });

  it('holds for review when the voucher amount or period conflicts with the quote, or the end is off-contract', () => {
    const amount = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation({ authorizedAmountCents: 700_000 }) }));
    assert.ok(amount.ok);
    assert.deepEqual(amount.reviewReasons, ['voucher_amount_differs']);
    const period = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation({ authorizedStartDate: '2026-10-01', authorizedEndDate: '2027-02-28' }) }));
    assert.ok(period.ok);
    assert.deepEqual(period.reviewReasons, ['voucher_period_conflict']);
    const end = checkJ6Prerequisites(j6Input({ classStarted: { ...classStarted, classEndDate: '2027-03-15' } }));
    assert.ok(end.ok);
    assert.deepEqual(end.reviewReasons, ['end_date_not_contract']);
    assert.equal(canSignJ6({ reviewReasons: amount.reviewReasons, reviewClearedAt: null, reviewNote: null }).ok, false);
    assert.equal(canSignJ6({ reviewReasons: amount.reviewReasons, reviewClearedAt: '2026-10-20T16:00:00Z', reviewNote: ' ' }).ok, false);
    assert.equal(canSignJ6({ reviewReasons: amount.reviewReasons, reviewClearedAt: '2026-10-20T16:00:00Z', reviewNote: 'Board confirmed in writing' }).ok, true);
    assert.equal(canSignJ6({ reviewReasons: [], reviewClearedAt: null, reviewNote: null }).ok, true);
  });

  it('builds the Invoice/Voucher Cover Letter with finance, the voucher ref and one $7,500 line', () => {
    const built = buildJ6Content({ ...j6Input(), documentNumber: 'WAP-I-2026-0001', issueDate: '2026-10-20', ...people, finance: { name: 'Synthetic Finance', email: 'finance@example.test' } });
    assert.ok(built.ok, !built.ok ? built.errors.join('; ') : '');
    const c = built.content;
    assert.equal(c.title, 'Invoice/Voucher Cover Letter');
    assert.deepEqual(c.recipients.map((r) => r.role), ['finance', 'counselor', 'student']);
    assert.equal(c.voucher.reference, 'PO-SYN-1');
    assert.equal(c.voucher.sha256, voucherArtifact.sha256);
    assert.equal(c.voucher.receivingSignaturePresent, true);
    assert.deepEqual(c.lineItems, [{ label: 'Tuition & Fees', amountCents: 750_000 }]);
    assert.equal(c.paymentFollowUp.wording, 'We will follow up in 10–14 days.');
    assert.doesNotMatch(JSON.stringify(c), /net ?(14|30)|due date|overdue|paid/i);
  });
});

function external(): Attestation {
  return saved(
    ok(recordExternalJ5Reference({ externalReference: 'MANUAL-Q-17', externalQuoteDate: '2026-08-01', copy: null, evidenceReference: 'synthetic sent-mail record', attestedBySubjectId: STAFF, confirmed: true, now: NOW })),
    'att-ext',
  );
}

describe('stage state machine', () => {
  it('allows draft -> signed -> sent -> superseded and nothing backwards', () => {
    assert.deepEqual(nextStageStatus('draft', 'sign'), { ok: true, status: 'signed' });
    assert.deepEqual(nextStageStatus('signed', 'mark_sent'), { ok: true, status: 'sent' });
    assert.deepEqual(nextStageStatus('sent', 'supersede'), { ok: true, status: 'superseded' });
    assert.equal(nextStageStatus('draft', 'mark_sent').ok, false);
    assert.equal(nextStageStatus('signed', 'edit_draft').ok, false);
    assert.equal(nextStageStatus('sent', 'void').ok, false);
    assert.equal(nextStageStatus('superseded', 'sign').ok, false);
    assert.equal(nextStageStatus('voided', 'edit_draft').ok, false);
  });

  it('summarizes the latest version per stage, voucher and payment', () => {
    assert.deepEqual(summarizeCase({ records: [], hasVoucherAttestation: false, latestPaymentStatus: null }), { j5: 'none', voucher: 'none', j6: 'none', payment: 'not_applicable' });
    assert.deepEqual(
      summarizeCase({
        records: [
          { stage: 'j5', status: 'superseded', version: 1 },
          { stage: 'j5', status: 'sent', version: 2 },
          { stage: 'j6', status: 'sent', version: 1 },
        ],
        hasVoucherAttestation: true,
        latestPaymentStatus: 'pending',
      }),
      { j5: 'sent', voucher: 'received', j6: 'sent', payment: 'pending' },
    );
  });
});

describe('frozen content hash', () => {
  it('is stable under key order and changes with any field', () => {
    const a = sentJ5().content;
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    assert.equal(contentSha256(reordered), contentSha256(a));
    assert.notEqual(contentSha256({ ...a, issueDate: '2026-09-16' }), contentSha256(a));
    assert.match(contentSha256(a), /^[0-9a-f]{64}$/);
  });

  it('numbers J5 quotes and J6 invoices separately', () => {
    assert.equal(formatStageDocumentNumber('j5', 2026, 7), 'WAP-Q-2026-0007');
    assert.equal(formatStageDocumentNumber('j6', 2026, 12), 'WAP-I-2026-0012');
  });
});
