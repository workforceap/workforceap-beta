import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  recordClassStarted,
  recordExternalJ5Reference,
  recordJ5Readiness,
  recordVoucherBoardSigned,
  VOUCHER_REFERENCE_MAX_LENGTH,
  type Attestation,
  type AttestationDraft,
} from './attestations';
import { contentSha256 } from './canonical';
import { signerIntentStatement, validateSignRequest } from './signing';
import { resolveProgramTerms } from './hours';
import { buildJ5Content, buildJ6Content, formatStageDocumentNumber, recipientRowsForContent, type J5Content } from './content';
import { VOUCHER_RECEIPT_SIGNATURE_UNATTESTED, canSignJ6, checkJ5Prerequisites, checkJ6Prerequisites, nextStageStatus, summarizeCase, type J6Prerequisites } from './stateMachine';
import { voucherReceiptSignatureStatus, type VoucherReceiptSignature } from './voucherReceipt';

const NOW = new Date('2026-10-20T15:00:00Z');
const STAFF = 'staff-synthetic';
const IT_SUPPORT = 'it-support-professional-certificate-ibm';
const AI_SOFTWARE = 'software-developer-professional-certificate-ibm';

const saved = (draft: AttestationDraft, id: string): Attestation => ({ ...draft, id, attestedAt: '2026-10-01T12:00:00.000Z' });
function ok<T>(r: { ok: true; attestation: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.attestation;
}

const readinessInput = (over: Partial<Parameters<typeof recordJ5Readiness>[0]> = {}): Parameters<typeof recordJ5Readiness>[0] => ({
  studentName: 'Synthetic Student',
  className: 'IT Support',
  classStartDate: '2026-09-30',
  studentReadyConfirmed: true,
  counselorRequestedBy: 'Synthetic Counselor',
  counselorRequestedOn: '2026-09-10',
  counselorRequestReference: 'synthetic request email #1',
  evidenceReference: 'synthetic referral #1',
  attestedBySubjectId: STAFF,
  confirmed: true,
  now: NOW,
  ...over,
});
const readiness = saved(ok(recordJ5Readiness(readinessInput())), 'att-ready');
const IT_CLASS = 'IT Support Professional Certificate (IBM)';
const LOGO_SHA = createHash('sha256').update(readFileSync('public/images/wap_logo.png')).digest('hex');
const people = {
  student: { name: 'Synthetic Student', email: 'student@example.test' },
  counselor: { name: 'Synthetic Counselor', email: 'counselor@example.test', phone: '(512) 555-0100' },
  boardName: 'Workforce Solutions Synthetic Area',
};

function sentJ5(programSlug = IT_SUPPORT): { recordId: string; status: 'sent'; content: J5Content; contentSha256: string } {
  const built = buildJ5Content({ logoSha256: LOGO_SHA, documentNumber: 'WAP-Q-2026-0001', issueDate: '2026-09-15', programSlug, readiness, ...people });
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
        authorizedProgramSlug: IT_SUPPORT,
        authorizedClassName: IT_CLASS,
        authorizedStartDate: '2026-09-01',
        authorizedEndDate: '2027-03-31',
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
    const built = buildJ5Content({ logoSha256: LOGO_SHA, documentNumber: 'WAP-Q-2026-0001', issueDate: '2026-09-15', programSlug: IT_SUPPORT, readiness, ...people });
    assert.ok(built.ok);
    const c = built.content;
    assert.equal(c.title, 'Quote / Voucher Request');
    assert.deepEqual(c.training, { programSlug: IT_SUPPORT, className: 'IT Support Professional Certificate (IBM)', contactHours: 160, classStartDate: '2026-09-30', classEndDate: '2027-02-28' });
    assert.deepEqual(c.lineItems, [{ label: 'Tuition & Fees', amountCents: 750_000 }]);
    assert.equal(c.totalCents, 750_000);
    assert.deepEqual(c.recipients.map((r) => r.role), ['counselor', 'student']);
    assert.equal(c.signer.line, 'Michael A. Brown, PMP, ChE — Executive Director');
    assert.ok(!('voucher' in c) && !('finance' in c));
    assert.doesNotMatch(JSON.stringify(c), /invoice/i);
  });

  it('freezes 200 hours and the clamped end date for the AI & Software program', () => {
    const r = saved(ok(recordJ5Readiness(readinessInput({ classStartDate: '2026-10-31' }))), 'r2');
    const built = buildJ5Content({ logoSha256: LOGO_SHA, documentNumber: 'WAP-Q-2026-0002', issueDate: '2026-10-01', programSlug: 'ai-and-software-development-professional-certificate-ibm', readiness: r, ...people });
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
    assert.equal(recordJ5Readiness(readinessInput({ evidenceReference: ' ' })).ok, false);
    assert.equal(recordJ5Readiness(readinessInput({ confirmed: false })).ok, false);
    assert.equal(recordJ5Readiness(readinessInput({ classStartDate: '' })).ok, false);
  });

  it('records both facts separately: student approved/ready AND the counselor request (who, when, reference)', () => {
    const cases: Array<[string, Partial<Parameters<typeof recordJ5Readiness>[0]>, RegExp]> = [
      ['not ready', { studentReadyConfirmed: false }, /approved and ready/],
      ['no requester', { counselorRequestedBy: ' ' }, /which counselor/],
      ['no request date', { counselorRequestedOn: '' }, /date the counselor requested/],
      ['future request date', { counselorRequestedOn: '2026-10-21' }, /cannot be in the future/],
      ['no request reference', { counselorRequestReference: '' }, /reference of the counselor/],
    ];
    for (const [label, over, message] of cases) {
      const r = recordJ5Readiness(readinessInput(over));
      assert.equal(r.ok, false, label);
      assert.match(!r.ok ? r.errors.join(' ') : '', message, label);
    }
    assert.equal(readiness.studentReadyConfirmed, true);
    assert.equal(readiness.counselorRequestedBy, 'Synthetic Counselor');
    assert.equal(checkJ5Prerequisites({ hasOpenJ5: false, readiness: { ...readiness, studentReadyConfirmed: null }, programSlug: IT_SUPPORT }).ok, false);
    assert.equal(checkJ5Prerequisites({ hasOpenJ5: false, readiness: { ...readiness, counselorRequestReference: null }, programSlug: IT_SUPPORT }).ok, false);
    const built = buildJ5Content({ logoSha256: LOGO_SHA, documentNumber: 'WAP-Q-2026-0003', issueDate: '2026-09-15', programSlug: IT_SUPPORT, readiness, ...people });
    assert.ok(built.ok);
    assert.deepEqual(built.content.readiness.counselorRequest, { requestedBy: 'Synthetic Counselor', requestedOn: '2026-09-10', reference: 'synthetic request email #1' });
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
    const noSig = recordVoucherBoardSigned({ boardName: 'B', voucherReference: 'PO', artifact: voucherArtifact, authorizedAmountCents: 750_000, authorizedProgramSlug: IT_SUPPORT, authorizedClassName: IT_CLASS, authorizedStartDate: '2026-09-01', authorizedEndDate: '2027-03-31', receivedOn: '2026-10-02', receivingSignaturePresent: false, evidenceReference: 'e', attestedBySubjectId: STAFF, confirmed: true, now: NOW });
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
    assert.deepEqual(gate.priorJ5, { source: 'external', attestationId: 'att-ext', reference: 'MANUAL-Q-17', quoteDate: '2026-08-01', copyArtifactId: null, programSlug: IT_SUPPORT, className: IT_CLASS });
    const other = checkJ6Prerequisites(j6Input({ priorJ5: { source: 'external', attestation: { ...external(), quotedProgramSlug: 'data-analytics-professional-certificate-google', quotedClassName: 'Data Analytics' } } }));
    assert.ok(other.ok);
    assert.deepEqual(other.reviewReasons, ['class_differs_from_quote']);
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

  const START = '2026-09-30';
  const sign = (reviewReasons: readonly string[], classStartDate = START, now = NOW) => canSignJ6({ reviewReasons, classStartDate, now, voucherReceiptSignature: { ok: true } });

  it('a $7,000 voucher can never be signed; there is no review or exception bypass; a corrected voucher unlocks it', () => {
    const va = voucherAttestation({ authorizedAmountCents: 700_000 });
    const amount = checkJ6Prerequisites(j6Input({ voucherAttestation: va }));
    assert.ok(amount.ok);
    assert.deepEqual(amount.reviewReasons, ['voucher_amount_differs']);
    const refused = sign(amount.reviewReasons);
    assert.equal(refused.ok, false);
    assert.match(!refused.ok ? refused.errors.join(' ') : '', /cannot clear/);
    // canSignJ6 takes no review note or exception input at all.
    const corrected = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation() }));
    assert.ok(corrected.ok);
    assert.deepEqual(corrected.reviewReasons, []);
    assert.equal(sign([]).ok, true);
  });

  it('period and contract-end holds are hard: only corrected voucher or class evidence clears them', () => {
    const period = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation({ authorizedStartDate: '2026-10-01', authorizedEndDate: '2027-02-28' }) }));
    assert.ok(period.ok);
    assert.deepEqual(period.reviewReasons, ['voucher_period_conflict']);
    assert.equal(sign(period.reviewReasons).ok, false);
    const end = checkJ6Prerequisites(j6Input({ classStarted: { ...classStarted, classEndDate: '2027-03-15' } }));
    assert.ok(end.ok);
    assert.deepEqual(end.reviewReasons, ['end_date_not_contract']);
    assert.equal(sign(end.reviewReasons).ok, false);
    const fixed = checkJ6Prerequisites(j6Input({ classStarted: { ...classStarted, classEndDate: '2027-02-28' }, voucherAttestation: voucherAttestation() }));
    assert.ok(fixed.ok);
    assert.deepEqual(fixed.reviewReasons, []);
  });

  it('a J6 is never signable without the designated signer\'s receipt-signature attestation on the exact voucher hash', () => {
    const H = 'a'.repeat(64);
    const voucher = { artifactId: 'art-voucher', sha256: H };
    const att = (over: Partial<VoucherReceiptSignature> = {}): VoucherReceiptSignature => ({
      voucherArtifactId: 'art-voucher', voucherSha256: H, attestedByUserId: 'michael', method: 'present_on_original', representation: null, attestedAt: '2026-10-01T15:00:00.000Z', ...over,
    });
    const status = (designated: string | null, attestations: VoucherReceiptSignature[], v = voucher) => voucherReceiptSignatureStatus({ voucher: v, designatedSignerUserId: designated, attestations });
    assert.deepEqual(status('michael', [att()]), { ok: true });
    const code = (s: ReturnType<typeof status>) => (!s.ok ? s.code : 'ok');
    assert.equal(code(status(null, [att()])), 'SIGNER_PRINCIPAL_UNSET');
    assert.equal(code(status('  ', [att()])), 'SIGNER_PRINCIPAL_UNSET');
    assert.equal(code(status('michael', [])), 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED');
    assert.equal(code(status('michael', [att({ attestedByUserId: 'staff' })])), 'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL');
    assert.equal(code(status('michael', [att({ voucherSha256: 'b'.repeat(64) })])), 'VOUCHER_RECEIPT_SIGNATURE_HASH_MISMATCH');
    // A replacement voucher is a new artifact: the old attestation no longer applies.
    assert.equal(code(status('michael', [att()], { artifactId: 'art-voucher-2', sha256: 'c'.repeat(64) })), 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED');
    assert.equal(code(status('michael', [att({ method: 'approved_signature_representation' })])), 'VOUCHER_RECEIPT_SIGNATURE_METHOD_INVALID');
    assert.deepEqual(status('michael', [att({ method: 'approved_signature_representation', representation: { artifactId: 'art-sig', sha256: 'd'.repeat(64) } })]), { ok: true });
    // canSignJ6: absent (a generic staff flag is not an input at all) or failing means blocked, with the code.
    const blocked = canSignJ6({ reviewReasons: [], classStartDate: START, now: NOW });
    assert.equal(blocked.ok, false);
    assert.deepEqual(!blocked.ok && blocked.codes, [VOUCHER_RECEIPT_SIGNATURE_UNATTESTED]);
    const wrong = canSignJ6({ reviewReasons: [], classStartDate: START, now: NOW, voucherReceiptSignature: status('michael', [att({ attestedByUserId: 'staff' })]) });
    assert.deepEqual(!wrong.ok && wrong.codes, [VOUCHER_RECEIPT_SIGNATURE_UNATTESTED, 'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL']);
    assert.equal(canSignJ6({ reviewReasons: [], classStartDate: START, now: NOW, voucherReceiptSignature: status('michael', [att()]) }).ok, true);
  });

  it('a J6 cannot be signed before its class starts (America/Chicago)', () => {
    assert.equal(sign([], '2026-10-21').ok, false);
    assert.equal(sign([], '2026-10-20').ok, true);
    // 03:30 UTC on Oct 21 is still Oct 20 in Texas.
    assert.equal(sign([], '2026-10-21', new Date('2026-10-21T03:30:00Z')).ok, false);
  });

  it('blocks a J6 whose class differs from the quote: two 160h classes, no review clears it', () => {
    const j5 = sentJ5(IT_SUPPORT);
    const other = resolveProgramTerms('data-analytics-professional-certificate-google');
    assert.ok(other.ok);
    assert.equal(other.hours, 160);
    const gate = checkJ6Prerequisites(j6Input({
      programSlug: other.canonicalSlug,
      priorJ5: { source: 'system', j5 },
      voucherAttestation: voucherAttestation({ authorizedProgramSlug: other.canonicalSlug, authorizedClassName: other.className }),
    }));
    assert.ok(gate.ok);
    assert.equal(gate.training.contactHours, j5.content.training.contactHours);
    assert.deepEqual(gate.reviewReasons, ['class_differs_from_quote']);
    assert.equal(sign(gate.reviewReasons).ok, false);
  });

  it('blocks a J6 whose board voucher authorizes another program or class', () => {
    const gate = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation({ authorizedProgramSlug: 'data-analytics-professional-certificate-google', authorizedClassName: 'Data Analytics Professional Certificate (Google)' }) }));
    assert.ok(gate.ok);
    assert.deepEqual(gate.reviewReasons, ['voucher_class_differs']);
    assert.equal(sign(gate.reviewReasons).ok, false);
    const alias = checkJ6Prerequisites(j6Input({ voucherAttestation: voucherAttestation({ authorizedClassName: 'IT Support (IBM)' }) }));
    assert.ok(alias.ok);
    assert.deepEqual(alias.reviewReasons, ['voucher_class_differs']);
    const missing = recordVoucherBoardSigned({ boardName: 'B', voucherReference: 'PO', artifact: voucherArtifact, authorizedAmountCents: 750_000, authorizedProgramSlug: '', authorizedClassName: '', authorizedStartDate: '2026-09-01', authorizedEndDate: '2027-03-31', receivedOn: '2026-10-02', receivingSignaturePresent: true, evidenceReference: 'e', attestedBySubjectId: STAFF, confirmed: true, now: NOW });
    assert.equal(missing.ok, false);
  });

  it('prints every contact block from the normalized recipient; the recipient rows come from those blocks', () => {
    const messy = {
      student: { name: '  Synthetic \t Student ', email: ' Student@Example.TEST' },
      counselor: { name: 'Synthetic  Counselor', email: 'COUNSELOR@example.test ', phone: ' (512)  555-0100 ' },
    };
    const built = buildJ6Content({ ...j6Input(), logoSha256: LOGO_SHA, documentNumber: 'WAP-I-2026-0009', issueDate: '2026-10-20', ...people, ...messy, finance: { name: 'Synthetic   Finance', email: 'Finance@Example.test' } });
    assert.ok(built.ok, !built.ok ? built.errors.join('; ') : '');
    const c = built.content;
    assert.deepEqual(c.student, { name: 'Synthetic Student', email: 'student@example.test' });
    assert.deepEqual(c.counselor, { name: 'Synthetic Counselor', email: 'counselor@example.test', phone: '(512) 555-0100' });
    assert.deepEqual(c.finance, { name: 'Synthetic Finance', email: 'finance@example.test' });
    assert.deepEqual(recipientRowsForContent(c), [
      { role: 'finance', name: 'Synthetic Finance', email: 'finance@example.test', phone: null },
      { role: 'counselor', name: 'Synthetic Counselor', email: 'counselor@example.test', phone: '(512) 555-0100' },
      { role: 'student', name: 'Synthetic Student', email: 'student@example.test', phone: null },
    ]);
    // Each printed block equals content.recipients for its role.
    for (const r of c.recipients) assert.deepEqual({ name: r.name, email: r.email }, { name: (c as unknown as Record<string, { name: string }>)[r.role].name, email: r.email });
    const j5 = buildJ5Content({ logoSha256: LOGO_SHA, documentNumber: 'WAP-Q-2026-0009', issueDate: '2026-09-15', programSlug: IT_SUPPORT, readiness, ...people, ...messy });
    assert.ok(j5.ok);
    assert.deepEqual(recipientRowsForContent(j5.content).map((r) => r.role), ['counselor', 'student']);
    assert.ok(!('finance' in j5.content));
  });

  it('limits the printed voucher/PO reference to 80 characters (renderer and DB CHECK)', () => {
    const at = (voucherReference: string) => recordVoucherBoardSigned({
      boardName: people.boardName, voucherReference, artifact: voucherArtifact, authorizedAmountCents: 750_000, authorizedProgramSlug: IT_SUPPORT,
      authorizedClassName: IT_CLASS, authorizedStartDate: '2026-09-01', authorizedEndDate: '2027-03-31', receivedOn: '2026-10-02',
      receivingSignaturePresent: true, evidenceReference: 'synthetic board email', attestedBySubjectId: STAFF, confirmed: true, now: NOW,
    });
    assert.equal(VOUCHER_REFERENCE_MAX_LENGTH, 80);
    assert.equal(at('P'.repeat(80)).ok, true);
    assert.equal(at('P'.repeat(81)).ok, false);
  });

  it('builds the Invoice / Voucher Cover Letter with finance, the voucher ref and one $7,500 line', () => {
    const built = buildJ6Content({ ...j6Input(), logoSha256: LOGO_SHA, documentNumber: 'WAP-I-2026-0001', issueDate: '2026-10-20', ...people, finance: { name: 'Synthetic Finance', email: 'finance@example.test' } });
    assert.ok(built.ok, !built.ok ? built.errors.join('; ') : '');
    const c = built.content;
    assert.equal(c.title, 'Invoice / Voucher Cover Letter');
    assert.deepEqual(c.recipients.map((r) => r.role), ['finance', 'counselor', 'student']);
    assert.equal(c.voucher.reference, 'PO-SYN-1');
    assert.equal(c.voucher.sha256, voucherArtifact.sha256);
    assert.equal(c.voucher.receivingSignaturePresent, true);
    assert.deepEqual(c.lineItems, [{ label: 'Tuition & Fees', amountCents: 750_000 }]);
    assert.equal(c.paymentFollowUp.wording, 'We will follow up in 10 to 14 days if payment has not been recorded.');
    assert.equal(c.paymentFollowUp.instruction, 'Please arrange payment by check or wire to Workforce Advancement Project and confirm the expected remittance date.');
    assert.ok(!JSON.stringify(c).includes('Empowering People'), 'the tagline is not a frozen printed field');
    assert.doesNotMatch(JSON.stringify(c), /net ?(14|30)|due date|overdue|paid/i);
  });
});

function external(): Attestation {
  return saved(
    ok(recordExternalJ5Reference({ externalReference: 'MANUAL-Q-17', externalQuoteDate: '2026-08-01', quotedProgramSlug: IT_SUPPORT, quotedClassName: IT_CLASS, copy: null, evidenceReference: 'synthetic sent-mail record', attestedBySubjectId: STAFF, confirmed: true, now: NOW })),
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
    assert.deepEqual(summarizeCase({ records: [], hasVoucherAttestation: false, paymentEvents: [] }), { j5: 'none', voucher: 'none', j6: 'none', payment: 'not_applicable' });
    assert.deepEqual(
      summarizeCase({
        records: [
          { id: 'q1', stage: 'j5', status: 'superseded', version: 1, sentAt: '2026-09-01T15:00:00Z' },
          { id: 'q2', stage: 'j5', status: 'sent', version: 2, sentAt: '2026-09-02T15:00:00Z' },
          { id: 'i1', stage: 'j6', status: 'sent', version: 1, sentAt: '2026-10-01T15:00:00Z' },
        ],
        hasVoucherAttestation: true,
        paymentEvents: [{ j6RecordId: 'i1', status: 'pending', recordedAt: '2026-10-01T15:00:00.000Z' }],
      }),
      { j5: 'sent', voucher: 'received', j6: 'sent', payment: 'pending' },
    );
  });

  it('keeps case payment on an ever-sent J6: v1 sent -> v2 sent (supersedes v1) -> v3 draft or voided', () => {
    const base = [
      { id: 'i1', stage: 'j6' as const, status: 'superseded' as const, version: 1, sentAt: '2026-10-01T15:00:00Z' },
      { id: 'i2', stage: 'j6' as const, status: 'superseded' as const, version: 2, sentAt: '2026-10-03T15:00:00Z' },
    ];
    const pending = { j6RecordId: 'i2', status: 'pending' as const, recordedAt: '2026-10-03T15:00:00.000Z' };
    const received = { j6RecordId: 'i2', status: 'received' as const, recordedAt: '2026-10-14T15:00:00.000Z' };
    for (const v3 of ['draft', 'voided', 'signed'] as const) {
      const records = [...base, { id: 'i3', stage: 'j6' as const, status: v3, version: 3, sentAt: null }];
      assert.deepEqual(summarizeCase({ records, hasVoucherAttestation: true, paymentEvents: [pending] }), { j5: 'none', voucher: 'received', j6: v3, payment: 'pending' });
      assert.equal(summarizeCase({ records, hasVoucherAttestation: true, paymentEvents: [pending, received] }).payment, 'received');
    }
    // Monotonic: once received, a later pending (refused by the database) never regresses the summary.
    const lateV3Pending = { j6RecordId: 'i2', status: 'pending' as const, recordedAt: '2026-10-20T15:00:00.000Z' };
    assert.equal(summarizeCase({ records: base, hasVoucherAttestation: true, paymentEvents: [pending, received, lateV3Pending] }).payment, 'received');
    // An event on a never-sent J6 never shows (the database refuses it anyway).
    assert.equal(
      summarizeCase({ records: [{ id: 'i9', stage: 'j6', status: 'superseded', version: 1, sentAt: null }], hasVoucherAttestation: true, paymentEvents: [{ j6RecordId: 'i9', status: 'pending', recordedAt: '2026-10-01T15:00:00.000Z' }] }).payment,
      'not_applicable',
    );
  });
});

describe('frozen content hash', () => {
  it('binds the exact logo bytes: new logo bytes change the version hash and an old-hash sign request is refused', () => {
    const base = { documentNumber: 'WAP-Q-2026-0009', issueDate: '2026-09-15', programSlug: IT_SUPPORT, readiness, ...people };
    const before = buildJ5Content({ ...base, logoSha256: LOGO_SHA });
    const otherLogo = createHash('sha256').update(Buffer.concat([readFileSync('public/images/wap_logo.png'), Buffer.from([0])])).digest('hex');
    const after = buildJ5Content({ ...base, logoSha256: otherLogo });
    assert.ok(before.ok && after.ok);
    assert.equal(before.content.letterhead.logo.sha256, LOGO_SHA);
    assert.notEqual(after.contentSha256, before.contentSha256);
    const target = { id: 'rec-1', version: 1, status: 'draft' as const, contentSha256: after.contentSha256, documentTitle: 'Quote / Voucher Request', documentNumber: 'WAP-Q-2026-0009' };
    const stale = { recordId: 'rec-1', version: 1, contentSha256: before.contentSha256, intentConfirmed: true, intentText: signerIntentStatement({ ...target, contentSha256: before.contentSha256 }) };
    const r = validateSignRequest(target, stale);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 409);
    assert.equal(buildJ5Content({ ...base, logoSha256: 'not-a-hash' }).ok, false);
  });

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
