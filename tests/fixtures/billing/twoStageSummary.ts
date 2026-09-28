/**
 * Synthetic CaseSummaryDto builders for the M4 two-stage billing UI specs.
 * Shapes and messages follow the M3 summary (lib/billing/twoStage/api/summary.ts,
 * gates.ts, blockers.ts); every value is fake.
 */
import type {
  ArtifactView,
  CaseSummaryDto,
  DesignatedSignerTask,
  GateState,
  J5StageView,
  J6StageView,
  StageVersionView,
} from '@/lib/billing/twoStage/dto';

export const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
export const CASE_ID = '22222222-2222-4222-8222-222222222222';
export const J5_RECORD_ID = '33333333-3333-4333-8333-333333333333';
export const VOUCHER_ID = '44444444-4444-4444-8444-444444444444';
export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);
export const VOUCHER_SHA = 'c0ffee'.padEnd(64, '0');

export const GATE_TEXT = {
  signing: 'Signing is disabled until the executive signer account is configured.',
  signedRenderer: 'Signed J5/J6 PDFs cannot be produced until the signature representation is approved.',
  principal: 'No signer principal is designated yet; the voucher receipt attestation, J5 and J6 signing, and J6 sending stay closed.',
  email: 'J5/J6 email delivery is not enabled yet.',
};

const open: GateState = { enabled: true, code: null, message: null };

export function closedGates(): CaseSummaryDto['gates'] {
  return {
    migration: open,
    providerOrg: open,
    financeArchive: { enabled: null, code: null, message: 'Checked when a file is stored or read; this view does not call Storage.' },
    signing: { enabled: false, code: 'SIGNER_NOT_CONFIGURED', message: GATE_TEXT.signing },
    signedRenderer: { enabled: false, code: 'SIGNED_RENDERER_UNAVAILABLE', message: GATE_TEXT.signedRenderer },
    receiptSignaturePrincipal: { enabled: false, code: 'SIGNER_PRINCIPAL_UNSET', message: GATE_TEXT.principal },
    realEmail: { enabled: false, code: 'EMAIL_NOT_ENABLED', message: GATE_TEXT.email },
  };
}

export function openGates(): CaseSummaryDto['gates'] {
  return { migration: open, providerOrg: open, financeArchive: open, signing: open, signedRenderer: open, receiptSignaturePrincipal: open, realEmail: open };
}

const staff = { subjectId: '55555555-5555-4555-8555-555555555555', displayName: 'Synthetic Staff' };

const training = {
  programSlug: 'google-it-support-professional-certificate',
  className: 'Google IT Support Professional Certificate',
  contactHours: 160 as const,
  classStartDate: '2026-10-05',
  classEndDate: '2027-03-05',
};

export function j5Draft(overrides: Partial<StageVersionView> = {}): StageVersionView {
  return {
    recordId: J5_RECORD_ID,
    version: 1,
    status: 'draft',
    documentNumber: 'WAP-Q-2026-0001',
    versionHash: HASH_A,
    issueDate: '2026-09-28',
    training,
    amountCents: 750000,
    createdAt: '2026-09-28T15:00:00.000Z',
    updatedAt: '2026-09-28T15:00:00.000Z',
    createdBy: staff,
    signed: null,
    sentAt: null,
    recipients: [
      { role: 'counselor', name: 'Casey Counselor', email: 'casey.counselor@example.test', phone: '(512) 555-0100' },
      { role: 'student', name: 'Sam Student', email: 'sam.student@example.test', phone: null },
    ],
    delivery: [
      { role: 'counselor', name: 'Casey Counselor', email: 'casey.counselor@example.test', latest: null, nextAction: 'send', retryWindowEndsAt: null, deliveryEvents: [], followUp: false },
      { role: 'student', name: 'Sam Student', email: 'sam.student@example.test', latest: null, nextAction: 'send', retryWindowEndsAt: null, deliveryEvents: [], followUp: false },
    ],
    closed: null,
    ...overrides,
  };
}

function j5View(overrides: Partial<J5StageView> = {}): J5StageView {
  return {
    current: null,
    history: [],
    rolesThatReceivedEarlierVersions: [],
    blockers: [
      { code: 'J5_READINESS_MISSING', message: 'Record the J5 readiness attestation (with the confirmed class start date) first.', hardHold: false },
      { code: 'DRAFT_MISSING', message: 'Save a draft first.', hardHold: false },
    ],
    canSaveDraft: true,
    canSign: false,
    canSend: false,
    readinessAttestation: null,
    programTerms: { ok: true, programSlug: training.programSlug, className: training.className, contactHours: 160 },
    contacts: {
      student: { name: { value: 'Sam Student', source: 'member_profile' }, email: { value: 'sam.student@example.test', source: 'member_profile' } },
      counselor: {
        name: { value: 'Assigned Counselor', source: 'assigned_counselor' },
        email: { value: 'assigned.counselor@example.test', source: 'assigned_counselor' },
        phone: { value: null, source: 'none' },
      },
    },
    ...overrides,
  };
}

function j6View(overrides: Partial<J6StageView> = {}): J6StageView {
  return {
    current: null,
    history: [],
    rolesThatReceivedEarlierVersions: [],
    blockers: [
      { code: 'J6_PRIOR_QUOTE_MISSING', message: 'A sent J5 quote or an approved external quote must be on file first.', hardHold: false },
      { code: 'RECEIVING_SIGNATURE_NOT_ATTESTED', message: 'Michael A. Brown must attest, signed in as himself, that his receiving signature is on this exact uploaded voucher. A staff confirmation does not count.', hardHold: false },
      { code: 'DRAFT_MISSING', message: 'Save a draft first.', hardHold: false },
    ],
    canSaveDraft: true,
    canSign: false,
    canSend: false,
    priorQuote: null,
    classStarted: null,
    voucher: null,
    boardInvoice: null,
    matches: null,
    holds: [],
    variance: null,
    contacts: {
      finance: { name: { value: null, source: 'none' }, email: { value: null, source: 'none' } },
      counselor: {
        name: { value: 'Assigned Counselor', source: 'assigned_counselor' },
        email: { value: 'assigned.counselor@example.test', source: 'assigned_counselor' },
        phone: { value: null, source: 'none' },
      },
      student: { name: { value: 'Sam Student', source: 'member_profile' }, email: { value: 'sam.student@example.test', source: 'member_profile' } },
    },
    ...overrides,
  };
}

/** A case with nothing recorded yet: no attestations, no drafts, every release gate closed except the migration. */
export function emptyCaseSummary(overrides: Partial<CaseSummaryDto> = {}): CaseSummaryDto {
  return {
    case: { id: CASE_ID, programSlug: training.programSlug, className: training.className, contactHours: 160, createdAt: '2026-09-28T14:00:00.000Z', createdBy: staff },
    progress: { j5: 'none', voucher: 'none', j6: 'none', payment: 'not_applicable' },
    gates: closedGates(),
    viewer: { isExecutiveSigner: false, isDesignatedSigner: false },
    j5: j5View(),
    j6: j6View(),
    payment: { status: 'not_applicable', j6RecordId: null, events: [] },
    readiness: {},
    readinessByStage: {
      j5: { studentApprovedAndReady: false, counselorRequestedQuote: false, programAndClassDatesConfirmed: false },
      j6: { priorQuoteVerified: false, originalVoucherHashVerified: false, michaelReceivingSignatureAttested: false },
    },
    readinessWaitingOn: {},
    waitingOnDesignatedSigner: [],
    ...overrides,
  };
}

/** J5 readiness recorded and a saved J5 draft (WAP-Q-2026-0001). */
export function j5DraftSummary(overrides: Partial<CaseSummaryDto> = {}): CaseSummaryDto {
  const base = emptyCaseSummary();
  return {
    ...base,
    progress: { ...base.progress, j5: 'draft' },
    j5: j5View({
      current: j5Draft(),
      blockers: [
        { code: 'SIGNER_NOT_CONFIGURED', message: GATE_TEXT.signing, hardHold: false },
        { code: 'SIGNED_RENDERER_UNAVAILABLE', message: GATE_TEXT.signedRenderer, hardHold: false },
        { code: 'SIGNER_PRINCIPAL_UNSET', message: GATE_TEXT.principal, hardHold: false },
      ],
      readinessAttestation: {
        attestationId: '77777777-7777-4777-8777-777777777777',
        attestedBy: staff,
        attestedAt: '2026-09-28T14:30:00.000Z',
        statement: 'Synthetic readiness statement.',
        evidenceReference: 'SYN-EVIDENCE-1',
        studentReadyConfirmed: true,
        counselorRequest: { requestedBy: 'Casey Counselor', requestedOn: '2026-09-27', reference: 'SYN-REQ-1' },
        confirmedClassStartDate: training.classStartDate,
        quotedClassEndDate: training.classEndDate,
      },
      contacts: {
        student: { name: { value: 'Sam Student', source: 'draft' }, email: { value: 'sam.student@example.test', source: 'draft' } },
        counselor: {
          name: { value: 'Casey Counselor', source: 'draft' },
          email: { value: 'casey.counselor@example.test', source: 'draft' },
          phone: { value: '(512) 555-0100', source: 'draft' },
        },
      },
    }),
    readinessByStage: {
      j5: {
        studentApprovedAndReady: true,
        counselorRequestedQuote: true,
        programAndClassDatesConfirmed: true,
        boardConfirmed: true,
        counselorContactVerified: true,
        studentEmailVerified: true,
      },
      j6: { priorQuoteVerified: false, originalVoucherHashVerified: false, michaelReceivingSignatureAttested: false },
    },
    ...overrides,
  };
}

export function voucherArtifact(): ArtifactView {
  return {
    id: VOUCHER_ID,
    kind: 'board_signed_voucher',
    source: 'uploaded',
    fileName: 'synthetic-voucher.pdf',
    byteLength: 20480,
    sha256: VOUCHER_SHA,
    createdBy: staff,
    createdAt: '2026-09-28T16:00:00.000Z',
    downloadPath: `/api/admin/members/${MEMBER_ID}/billing/two-stage/cases/${CASE_ID}/files/${VOUCHER_ID}`,
  };
}

export function signerTasks(viewerIsDesignatedSigner: boolean, ready = true): DesignatedSignerTask[] {
  return [
    {
      step: 'voucher_data',
      artifactId: VOUCHER_ID,
      sha256: VOUCHER_SHA,
      readinessKeys: ['voucherReferenceAndReceivedDateVerified', 'voucherTermsVerified'],
      blockerCode: 'J6_VOUCHER_ATTESTATION_INCOMPLETE',
      message:
        'Waiting on Michael A. Brown to record the voucher details (reference, received date, authorized program/class, amount and period) for this exact file. A staff account cannot record them.',
      ready,
      viewerIsDesignatedSigner,
    },
    {
      step: 'voucher_receipt_signature',
      artifactId: VOUCHER_ID,
      sha256: VOUCHER_SHA,
      readinessKeys: ['michaelReceivingSignatureAttested'],
      blockerCode: 'RECEIVING_SIGNATURE_NOT_ATTESTED',
      message: 'Michael A. Brown must attest, signed in as himself, that his receiving signature is on this exact uploaded voucher. A staff confirmation does not count.',
      ready: false,
      viewerIsDesignatedSigner,
    },
  ];
}

/** A staff upload of the voucher file after a sent J5: the voucher data and receiving signature now wait on Michael. */
export function waitingOnMichaelSummary(viewerIsDesignatedSigner = false): CaseSummaryDto {
  const base = j5DraftSummary();
  return {
    ...base,
    viewer: { isExecutiveSigner: viewerIsDesignatedSigner, isDesignatedSigner: viewerIsDesignatedSigner },
    progress: { j5: 'sent', voucher: 'received', j6: 'none', payment: 'not_applicable' },
    j6: j6View({
      voucher: { artifact: voucherArtifact(), attestation: null, receiptAttestation: null, earlierAttestations: [] },
      blockers: [
        {
          code: 'J6_VOUCHER_ATTESTATION_INCOMPLETE',
          message:
            'Waiting on Michael A. Brown to record the voucher details (reference, received date, authorized program/class, amount and period) for this exact file. A staff account cannot record them.',
          hardHold: false,
          waitingOn: 'designated_signer',
        },
        {
          code: 'RECEIVING_SIGNATURE_NOT_ATTESTED',
          message: 'Michael A. Brown must attest, signed in as himself, that his receiving signature is on this exact uploaded voucher. A staff confirmation does not count.',
          hardHold: false,
          waitingOn: 'designated_signer',
        },
        { code: 'DRAFT_MISSING', message: 'Save a draft first.', hardHold: false },
      ],
    }),
    readinessByStage: {
      j5: base.readinessByStage.j5,
      j6: {
        priorQuoteVerified: true,
        voucherReferenceAndReceivedDateVerified: false,
        originalVoucherHashVerified: true,
        michaelReceivingSignatureAttested: false,
        voucherTermsVerified: false,
      },
    },
    readinessWaitingOn: {
      voucherReferenceAndReceivedDateVerified: 'designated_signer',
      voucherTermsVerified: 'designated_signer',
      michaelReceivingSignatureAttested: 'designated_signer',
    },
    waitingOnDesignatedSigner: signerTasks(viewerIsDesignatedSigner),
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
