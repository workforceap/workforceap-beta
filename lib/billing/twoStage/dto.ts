/**
 * Shared, client-safe DTOs for the two-stage J5/J6 API (docs/BILLING-PACKETS.md,
 * "Two-stage API contract (M3)"). Types and pure constants only: no server
 * imports, no Node built-ins. The M3 route handlers build their responses as
 * these types and the M4 editor (#2706) imports them, so field names are
 * defined once. M1 types are re-exported with `import type` (erased at build
 * time), never duplicated.
 */
import type { BillingStage } from './constants';
import type { ArtifactKind } from './financeStorage';
import type { PaymentView } from './payment';
import type { RecipientRole } from './recipients';
import type { SendStatus } from './sendClaims';
import type { CaseProgress, ReviewReason, StageStatus } from './stateMachine';

export type { ArtifactKind, BillingStage, CaseProgress, PaymentView, RecipientRole, ReviewReason, SendStatus, StageStatus };

/** Held J6 reasons (= M1 ReviewReason). */
export type HoldReason = ReviewReason;
export type IsoDate = string;
export type IsoInstant = string;
export type Sha256Hex = string;

// ---------------------------------------------------------------------------
// Readiness keys: exactly #2706 (2717102c) TwoStageBillingWorkbench ReadinessKey.

export const J5_READINESS_KEYS = [
  'studentApprovedAndReady',
  'counselorRequestedQuote',
  'boardConfirmed',
  'counselorContactVerified',
  'studentEmailVerified',
  'programAndClassDatesConfirmed',
] as const;

export const J6_READINESS_KEYS = [
  'priorQuoteVerified',
  'voucherReferenceAndReceivedDateVerified',
  'originalVoucherHashVerified',
  'michaelReceivingSignatureAttested',
  'voucherTermsVerified',
  'classStarted',
  'financeContactVerified',
  'boardConfirmed',
  'counselorContactVerified',
  'studentEmailVerified',
  'programAndClassDatesConfirmed',
] as const;

export type J5ReadinessKey = (typeof J5_READINESS_KEYS)[number];
export type J6ReadinessKey = (typeof J6_READINESS_KEYS)[number];
export type ReadinessKey = J5ReadinessKey | J6ReadinessKey;
/** Staff-verified facts only. An absent value means the server has nothing to check yet. */
export type TwoStageBillingReadiness = Partial<Record<ReadinessKey, boolean>>;

// ---------------------------------------------------------------------------
// Steps only the designated signer principal can complete. Staff may upload
// the voucher file; only the designated signer (Michael, signed in as
// himself) records its data and attests his receiving signature on its
// exact sha256.

export const DESIGNATED_SIGNER_STEPS = ['voucher_data', 'voucher_receipt_signature'] as const;
export type DesignatedSignerStep = (typeof DESIGNATED_SIGNER_STEPS)[number];

/** The J6 readiness keys that only the designated signer's own attestation can turn true. */
export const DESIGNATED_SIGNER_READINESS = {
  voucherReferenceAndReceivedDateVerified: 'voucher_data',
  voucherTermsVerified: 'voucher_data',
  michaelReceivingSignatureAttested: 'voucher_receipt_signature',
} as const satisfies Partial<Record<J6ReadinessKey, DesignatedSignerStep>>;
export type DesignatedSignerReadinessKey = keyof typeof DESIGNATED_SIGNER_READINESS;

/** Who the next action on a blocker belongs to. Absent on a blocker means staff. */
export type WaitingOn = 'designated_signer';

// ---------------------------------------------------------------------------
// Codes.

export const GATE_NAMES = [
  'migration',
  'providerOrg',
  'financeArchive',
  'signing',
  'signedRenderer',
  'receiptSignaturePrincipal',
  'realEmail',
] as const;
export type GateName = (typeof GATE_NAMES)[number];

export const GATE_CODES = [
  'MIGRATION_NOT_APPLIED',
  'PROVIDER_ORG_MISCONFIGURED',
  'FINANCE_ARCHIVE_UNAVAILABLE',
  'SIGNER_NOT_CONFIGURED',
  'SIGNED_RENDERER_UNAVAILABLE',
  'SIGNER_PRINCIPAL_UNSET',
  'EMAIL_NOT_ENABLED',
] as const;
export type GateCode = (typeof GATE_CODES)[number];

export const HOLD_BLOCKER_CODES = [
  'HOLD_VOUCHER_AMOUNT_DIFFERS',
  'HOLD_VOUCHER_CLASS_DIFFERS',
  'HOLD_VOUCHER_PERIOD_CONFLICT',
  'HOLD_END_DATE_NOT_CONTRACT',
  'HOLD_CLASS_DIFFERS_FROM_QUOTE',
] as const;

export const PREREQUISITE_BLOCKER_CODES = [
  'J5_ALREADY_OPEN',
  'J5_READINESS_MISSING',
  'J5_STUDENT_NOT_READY',
  'J5_COUNSELOR_REQUEST_MISSING',
  'PROGRAM_TERMS_UNAVAILABLE',
  'J6_ALREADY_OPEN',
  'J6_PRIOR_QUOTE_MISSING',
  'J6_J5_NOT_SENT',
  'J6_EXTERNAL_QUOTE_INCOMPLETE',
  'J6_VOUCHER_MISSING',
  'J6_VOUCHER_ATTESTATION_INCOMPLETE',
  'J6_VOUCHER_UNSIGNED',
  'J6_BOARD_INVOICE_INVALID',
  'J6_CLASS_START_MISSING',
  'J6_CLASS_START_FUTURE',
  'J6_VOUCHER_RECEIPT_FUTURE',
  'CLASS_NOT_STARTED',
  'COUNSELOR_PHONE_MISSING',
  'BOARD_NAME_MISSING',
  'RECIPIENTS_INVALID',
  'PREREQUISITE_UNMET',
  'DRAFT_MISSING',
  'DRAFT_STALE',
  'SENDS_UNRESOLVED',
  'RECEIVING_SIGNATURE_NOT_ATTESTED',
  'J6_ISSUE_DATE_NOT_TODAY',
] as const;

/** Every code a `Blocker` can carry: prerequisites, hard holds and gates. */
export const BLOCKER_CODES = [...PREREQUISITE_BLOCKER_CODES, ...HOLD_BLOCKER_CODES, ...GATE_CODES] as const;
export type BlockerCode = (typeof BLOCKER_CODES)[number];

/** Per-field validation codes of the draft editor. */
export const DRAFT_FIELD_ERROR_CODES = [
  'FIELD_REQUIRED',
  'EMAIL_INVALID',
  'EMAIL_DUPLICATE',
  'TEXT_NOT_PRINTABLE',
  'VOUCHER_REFERENCE_TOO_LONG',
  'BOARD_INVOICE_INVALID',
] as const;
export type DraftFieldErrorCode = (typeof DRAFT_FIELD_ERROR_CODES)[number];

/** Every `code` a two-stage route can return in an error body. */
export const ERROR_CODES = [
  ...GATE_CODES,
  // request and access
  'INVALID_JSON',
  'UNAUTHENTICATED',
  'ADMIN_REQUIRED',
  'ORIGIN_REJECTED',
  'PROVIDER_ORG_ONLY',
  'MEMBER_NOT_FOUND',
  'CASE_NOT_FOUND',
  'RECORD_NOT_FOUND',
  'SEND_NOT_FOUND',
  'FILE_NOT_FOUND',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'BILLING_RULE_REFUSED',
  'INTERNAL_ERROR',
  'OUTCOME_UNCERTAIN',
  // cases and drafts
  'CASE_EXISTS',
  'PROGRAM_TERMS_UNAVAILABLE',
  'ATTESTATION_INVALID',
  'DRAFT_INCOMPLETE',
  'J5_PREREQUISITES_MISSING',
  'J6_PREREQUISITES_MISSING',
  'DRAFT_CONFLICT',
  'DRAFT_STALE',
  'STAGE_ALREADY_OPEN',
  'NOT_A_DRAFT',
  'NOT_READY',
  'LOGO_CHANGED',
  'TEXT_NOT_PRINTABLE',
  'VOUCHER_REFERENCE_TOO_LONG',
  'RECIPIENT_SNAPSHOT_MISMATCH',
  'J6_HELD',
  'CLASS_NOT_STARTED',
  // signing
  'SIGNER_NOT_PROVIDER_ORG',
  'SIGNER_INACTIVE',
  'SIGNER_NOT_ADMIN',
  'NOT_SIGNER',
  'VERSION_STALE',
  'ALREADY_SIGNED',
  'INTENT_NOT_CONFIRMED',
  // voucher and uploads
  'UPLOAD_EMPTY',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_NOT_PDF',
  'VOUCHER_PDF_ONLY',
  'ARCHIVE_INTEGRITY_MISMATCH',
  'VOUCHER_HASH_MISMATCH',
  'VOUCHER_NOT_CURRENT',
  'RECEIVING_SIGNATURE_NOT_ATTESTED',
  // database refusals M1 names (mapped from the trigger text)
  'SIGNER_NOT_DESIGNATED',
  'VOUCHER_ATTESTER_NOT_SIGNER',
  'VOUCHER_ATTESTER_NOT_DESIGNATED',
  'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED',
  'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL',
  'LETTERHEAD_FOOTER_MISMATCH',
  'RECEIPT_SIGNATURE_METHOD_UNAVAILABLE',
  // sending, reconciliation, closure
  'NOT_SIGNED',
  'ATTACHMENT_MISMATCH',
  'RECORD_NOT_SIGNED',
  'CLAIM_IN_FLIGHT',
  'SEND_CHANGED',
  'NOT_RECONCILABLE',
  'RECONCILE_NOTE_REQUIRED',
  'EVIDENCE_NOT_IN_CASE',
  'CLOSE_NOT_ALLOWED',
  'PARTIAL_SEND_REQUIRES_CANCELLATION',
  'J5_LINKED_BY_OPEN_J6',
  'NO_SEND_CLAIMS',
  'SENDS_UNRESOLVED',
  'ALL_RECIPIENTS_ACCEPTED',
  'ACCEPTED_ROLES_CHANGED',
  'CLOSE_REASON_REQUIRED',
  // payment
  'PAYMENT_NOT_TRACKED',
  'PAYMENT_ALREADY_RECEIVED',
  'PAYMENT_J6_CHANGED',
  'PAYMENT_DATE_INVALID',
  'PAYMENT_RECEIVED_IN_FUTURE',
  'PAYMENT_EVIDENCE_REQUIRED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Shared shapes.

export type Blocker = {
  code: BlockerCode;
  message: string;
  hardHold: boolean;
  /** Present only when the designated signer, not staff, must act (voucher data, receiving signature). */
  waitingOn?: WaitingOn;
};

/** One step waiting on the designated signer for the case's current voucher file. */
export type DesignatedSignerTask = {
  step: DesignatedSignerStep;
  /** The current voucher file the step must name; the receipt attestation binds to `sha256`. */
  artifactId: string;
  sha256: Sha256Hex;
  readinessKeys: DesignatedSignerReadinessKey[];
  blockerCode: BlockerCode;
  message: string;
  /** False for the receiving signature until the voucher data is recorded, and while no designated signer is configured. */
  ready: boolean;
  /** Whether the viewing account is the designated signer (so the UI can offer the step to this viewer). */
  viewerIsDesignatedSigner: boolean;
};
/**
 * `enabled: null` = not checked by this response: the finance archive is
 * checked live only by the routes that store or read a file (the case summary
 * never calls Storage), so the summary reports it as unknown, never closed.
 */
export type GateState = { enabled: boolean | null; code: GateCode | null; message: string | null };
export type Actor = { subjectId: string; displayName: string | null };

export type ApiErrorBody = {
  code: ErrorCode;
  error: string;
  blockers?: Blocker[];
  holds?: HoldReason[];
  field?: string;
  fields?: Partial<Record<DraftField, DraftFieldError>>;
  /** Set on a refusal that came after part of the request was already stored or sent: reload and reconcile before retrying. */
  outcomeUncertain?: true;
};

export type ArtifactView = {
  id: string;
  kind: ArtifactKind;
  source: 'uploaded' | 'rendered';
  fileName: string;
  byteLength: number;
  /** Of the exact stored bytes, computed on the server. */
  sha256: Sha256Hex;
  /** Uploader, or the signer for a rendered PDF. */
  createdBy: Actor;
  createdAt: IsoInstant;
  downloadPath: string;
};

export type ContactSource = 'frozen_snapshot' | 'draft' | 'assigned_counselor' | 'member_profile' | 'none';
export type ContactField = { value: string | null; source: ContactSource };
export type ContactView = { name: ContactField; email: ContactField };
export type CounselorContactView = ContactView & { phone: ContactField };

export type RoleDeliveryView = {
  role: RecipientRole;
  name: string;
  email: string;
  latest: null | {
    sendId: string;
    attemptNo: number;
    status: SendStatus;
    claimedAt: IsoInstant;
    lastClaimedAt: IsoInstant;
    acceptedAt: IsoInstant | null;
    providerMessageId: string | null;
    reconciled: null | { at: IsoInstant; by: Actor; note: string };
  };
  nextAction: 'none' | 'send' | 'in_flight' | 'retry_same_key' | 'reconcile' | 'new_attempt_on_request';
  /** claimedAt + 23 h, for ambiguous claims. */
  retryWindowEndsAt: IsoInstant | null;
  deliveryEvents: Array<{ kind: 'delivered' | 'bounced' | 'complained'; occurredAt: IsoInstant; source: string }>;
  followUp: boolean;
};

export type TrainingView = { programSlug: string; className: string; contactHours: 160 | 200; classStartDate: IsoDate; classEndDate: IsoDate };

export type StageVersionView = {
  recordId: string;
  version: number;
  status: StageStatus;
  documentNumber: string;
  versionHash: Sha256Hex;
  issueDate: IsoDate;
  training: TrainingView;
  amountCents: 750000;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  createdBy: Actor;
  signed: null | { signedAt: IsoInstant; signedBy: Actor; signatureMethod: 'typed_attestation'; artifact: ArtifactView };
  sentAt: IsoInstant | null;
  recipients: Array<{ role: RecipientRole; name: string; email: string; phone: string | null }>;
  delivery: RoleDeliveryView[];
  closed: null | {
    status: 'superseded' | 'voided';
    at: IsoInstant;
    by: Actor | null;
    reason: string | null;
    acceptedRolesAtClose: RecipientRole[];
    partialSendCancellation: null | { at: IsoInstant; by: Actor; reason: string };
  };
};

export type StageViewCommon = {
  current: StageVersionView | null;
  history: StageVersionView[];
  rolesThatReceivedEarlierVersions: Array<{ role: RecipientRole; versions: number[] }>;
  /** For the next step of this stage. */
  blockers: Blocker[];
  /** Advisory: opening the draft editor is always allowed; saving needs the complete set. */
  canSaveDraft: boolean;
  canSign: boolean;
  canSend: boolean;
};

export type J5StageView = StageViewCommon & {
  readinessAttestation: null | {
    attestationId: string;
    attestedBy: Actor;
    attestedAt: IsoInstant;
    statement: string;
    evidenceReference: string;
    studentReadyConfirmed: true;
    counselorRequest: { requestedBy: string; requestedOn: IsoDate; reference: string };
    confirmedClassStartDate: IsoDate;
    quotedClassEndDate: IsoDate;
  };
  programTerms: { ok: true; programSlug: string; className: string; contactHours: 160 | 200 } | { ok: false; code: 'PROGRAM_TERMS_UNAVAILABLE'; message: string };
  contacts: { student: ContactView; counselor: CounselorContactView };
};

/** Michael's receiving-signature attestation by the signer principal, bound to one voucher sha256. */
export type VoucherReceiptAttestationView = {
  attestationId: string;
  artifactId: string;
  sha256: Sha256Hex;
  attestedBy: Actor;
  attestedAt: IsoInstant;
  /** M1 VOUCHER_RECEIPT_SIGNATURE_METHODS. `approved_signature_representation` is refused by M3 in this release. */
  method: 'present_on_original' | 'approved_signature_representation';
};

export type VoucherMatch = {
  check: 'amount' | 'program' | 'class' | 'period' | 'contract_end_date' | 'prior_quote';
  result: 'ok' | 'mismatch';
  expected: string;
  actual: string;
  reasonCode: HoldReason;
  hardHold: true;
};

export type VoucherAttestationView = {
  attestationId: string;
  voucherReference: string;
  receivedOn: IsoDate;
  authorizedAmountCents: number;
  authorizedProgramSlug: string;
  authorizedClassName: string;
  authorizedStartDate: IsoDate;
  authorizedEndDate: IsoDate;
  attestedBy: Actor;
  attestedAt: IsoInstant;
  statement: string;
  evidenceReference: string;
};

export type J6StageView = StageViewCommon & {
  priorQuote:
    | null
    | { source: 'system'; recordId: string; version: number; documentNumber: string; status: StageStatus; sentAt: IsoInstant | null; estimate: TrainingView }
    | {
        source: 'external';
        attestationId: string;
        reference: string;
        quoteDate: IsoDate;
        programSlug: string;
        className: string;
        copy: ArtifactView | null;
        attestedBy: Actor;
        attestedAt: IsoInstant;
      };
  classStarted: null | {
    attestationId: string;
    classStartDate: IsoDate;
    classEndDate: IsoDate;
    attestedBy: Actor;
    attestedAt: IsoInstant;
    evidenceReference: string;
    startedOnOrBeforeToday: boolean;
  };
  voucher: null | {
    /** Original uploaded bytes: server sha256, uploader, upload time. */
    artifact: ArtifactView;
    /** Staff data entry from the voucher (never satisfies the receiving signature). */
    attestation: VoucherAttestationView | null;
    /** The signer principal's attestation on exactly `artifact.sha256`; null after a replacement. */
    receiptAttestation: VoucherReceiptAttestationView | null;
    earlierAttestations: Array<{ attestationId: string; attestedAt: IsoInstant; attestedBy: Actor }>;
  };
  boardInvoice: ArtifactView | null;
  matches: null | VoucherMatch[];
  holds: HoldReason[];
  variance: null | { startShiftDays: number; endShiftDays: number; hoursDelta: number };
  contacts: { finance: ContactView; counselor: CounselorContactView; student: ContactView };
};

export type PaymentDto = PaymentView & {
  j6RecordId: string | null;
  events: Array<{
    status: 'pending' | 'received';
    j6RecordId: string;
    recordedAt: IsoInstant;
    recordedBy: Actor;
    expectedFollowUpFrom?: IsoDate;
    expectedFollowUpTo?: IsoDate;
    receivedOn?: IsoDate;
    evidence?: string;
  }>;
};

export type CaseListItemDto = {
  id: string;
  programSlug: string;
  className: string | null;
  createdAt: IsoInstant;
  progress: CaseProgress;
};

export type ListCasesDto = { cases: CaseListItemDto[] };
export type OpenCaseRequest = { programSlug: string };
export type OpenCaseDto = { case: CaseListItemDto };

/** GET …/cases/[caseId] */
export type CaseSummaryDto = {
  case: { id: string; programSlug: string; className: string | null; contactHours: 160 | 200 | null; createdAt: IsoInstant; createdBy: Actor };
  progress: CaseProgress;
  gates: Record<GateName, GateState>;
  viewer: { isExecutiveSigner: boolean; isDesignatedSigner: boolean };
  j5: J5StageView;
  j6: J6StageView;
  payment: PaymentDto;
  /**
   * @deprecated Use `readinessByStage`. Exactly #2706 `2717102c`
   * TwoStageBillingReadiness, merging both stages: a shared key shows the J6
   * value when the J6 has one (and the case has a prior quote), otherwise the
   * J5 value. Kept until #2706 reads the per-stage values.
   */
  readiness: TwoStageBillingReadiness;
  readinessByStage: { j5: Partial<Record<J5ReadinessKey, boolean>>; j6: Partial<Record<J6ReadinessKey, boolean>> };
  /** The readiness keys above that are false only because the designated signer has not acted yet. */
  readinessWaitingOn: Partial<Record<DesignatedSignerReadinessKey, WaitingOn>>;
  /** Steps waiting on the designated signer, in the order they must happen; empty when none are waiting. */
  waitingOnDesignatedSigner: DesignatedSignerTask[];
};

// ---------------------------------------------------------------------------
// Draft editor (reviewed draft workflow).

export type J5DraftInput = {
  boardName: string;
  student: { name: string; email: string };
  counselor: { name: string; email: string; phone: string };
};
export type J6DraftInput = J5DraftInput & {
  finance: { name: string; email: string };
  /** An uploaded board invoice of this case, or null. Never picked automatically. */
  boardInvoiceArtifactId: string | null;
};
export type DraftInput<S extends BillingStage = BillingStage> = S extends 'j5' ? J5DraftInput : J6DraftInput;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object | null ? (T[K] extends null ? T[K] : DeepPartial<NonNullable<T[K]>> | Extract<T[K], null>) : T[K] };
/** Any subset of the editable fields (the editor may be missing facts). */
export type DraftPatch<S extends BillingStage = BillingStage> = DeepPartial<DraftInput<S>>;

export const DRAFT_FIELDS = [
  'boardName',
  'student.name',
  'student.email',
  'counselor.name',
  'counselor.email',
  'counselor.phone',
  'finance.name',
  'finance.email',
  'boardInvoiceArtifactId',
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftFieldError = { code: DraftFieldErrorCode; message: string };

/** POST …/[stage]/draft/review: validate a partial draft; never writes. */
export type DraftReviewRequest<S extends BillingStage = BillingStage> = DraftPatch<S>;
export type DraftReviewDto = {
  stage: BillingStage;
  current: StageVersionView | null;
  fields: Partial<Record<DraftField, { value: string | null; source: ContactSource; error: DraftFieldError | null }>>;
  blockers: Blocker[];
  /** Every field valid and no prerequisite blocker: a save would succeed. */
  complete: boolean;
  holds: HoldReason[];
  versionHashIfSaved: Sha256Hex | null;
};

/** PUT …/[stage]/draft: persists only a complete, validated set (merged over the saved draft on update). */
export type DraftSaveRequest<S extends BillingStage = BillingStage> = DraftPatch<S> & { expectedVersionHash: Sha256Hex | null };
export type DraftSaveDto = { created: boolean; record: StageVersionView; versionHash: Sha256Hex; holds: HoldReason[] };

// ---------------------------------------------------------------------------
// Other route bodies.

export type AttestationDto = {
  attestation: {
    id: string;
    kind: 'j5_readiness' | 'class_started' | 'external_j5_reference' | 'voucher_board_signed';
    statement: string;
    attestedBy: Actor;
    attestedAt: IsoInstant;
  };
};
export type J5ReadinessRequest = {
  classStartDate: IsoDate;
  studentReadyConfirmed: true;
  counselorRequestedBy: string;
  counselorRequestedOn: IsoDate;
  counselorRequestReference: string;
  evidenceReference: string;
  confirmed: true;
};
export type ClassStartedRequest = { classStartDate: IsoDate; classEndDate: IsoDate; evidenceReference: string; confirmed: true };
export type ClassStartedDto = AttestationDto & { endDateIsContract: boolean };
export type ExternalQuoteAttestationPart = {
  externalReference: string;
  externalQuoteDate: IsoDate;
  quotedProgramSlug: string;
  quotedClassName: string;
  evidenceReference: string;
  confirmed: true;
};
export type ExternalQuoteDto = AttestationDto & { copy: ArtifactView | null; reused: boolean };

export type VoucherAttestationPart = {
  boardName: string;
  voucherReference: string;
  receivedOn: IsoDate;
  authorizedAmountCents: number;
  authorizedProgramSlug: string;
  authorizedClassName: string;
  authorizedStartDate: IsoDate;
  authorizedEndDate: IsoDate;
  /** Required by M1's staff attestation; a staff statement only, never the receiving-signature proof. */
  receivingSignaturePresent: true;
  evidenceReference: string;
  confirmed: true;
};
export type VoucherUploadDto = {
  artifact: ArtifactView;
  reused: boolean;
  /** The data-entry attestation (designated signer only in M1); null for a file-only staff upload. */
  attestation: VoucherAttestationView | null;
  /** Whether this file is now the case's current voucher (the newest upload or attestation). */
  current: boolean;
  /** Null after an upload: a new voucher hash needs its own principal attestation. */
  receiptAttestation: VoucherReceiptAttestationView | null;
  matches: VoucherMatch[] | null;
  holds: HoldReason[];
  /** For the current voucher: what now waits on the designated signer (empty for a replaced file). */
  waitingOnDesignatedSigner: DesignatedSignerTask[];
};
export type BoardInvoiceUploadDto = { artifact: ArtifactView; reused: boolean };

export type VoucherReceiptAttestationRequest = { expectedSha256: Sha256Hex; method: 'present_on_original'; statementConfirmed: true; statementText: string };
/** GET …/voucher/[artifactId]/receipt-attestation: the exact statement the designated signer confirms. */
export type VoucherReceiptStatementDto = { artifactId: string; sha256: Sha256Hex; statementText: string };
export type VoucherReceiptAttestationDto = { receiptAttestation: VoucherReceiptAttestationView };

export type FreezeRequest = { recordId: string; versionHash: Sha256Hex };
export type FreezeDto = {
  recordId: string;
  version: number;
  versionHash: Sha256Hex;
  documentTitle: string;
  documentNumber: string;
  intentText: string;
  previewPath: string;
  holds: HoldReason[];
};

export type SignRequestDto = { recordId: string; version: number; contentSha256: Sha256Hex; intentConfirmed: true; intentText: string };
export type SignDto = { record: StageVersionView; signedArtifact: ArtifactView };

export type SendOutcome =
  | 'ACCEPTED'
  | 'ALREADY_ACCEPTED'
  | 'FAILED'
  | 'AMBIGUOUS'
  | 'NEEDS_RECONCILIATION'
  | 'IN_FLIGHT'
  | 'FAILED_RETRY_NOT_REQUESTED';
export type SendRequest = { recordId: string; versionHash: Sha256Hex; retryFailedRoles?: RecipientRole[] };
export type RoleSendOutcome = {
  role: RecipientRole;
  name: string;
  email: string;
  outcome: SendOutcome;
  sendId: string | null;
  attemptNo: number | null;
  status: SendStatus | null;
  providerMessageId: string | null;
  message: string;
};
export type SendDto = {
  recordId: string;
  stageStatus: 'signed' | 'sent';
  complete: boolean;
  sentAt: IsoInstant | null;
  roles: RoleSendOutcome[];
  payment: PaymentDto | null;
};

export type ReconcileRequest = {
  outcome: 'delivered' | 'not_delivered';
  note: string;
  expectedStatus: 'ambiguous' | 'needs_reconciliation';
  evidenceArtifactId?: string | null;
};
export type ReconcileDto = { delivery: RoleDeliveryView; stageStatus: 'signed' | 'sent'; complete: boolean; sentAt: IsoInstant | null; payment: PaymentDto | null };

export type CloseRequest = { action: 'void' | 'supersede'; reason: string; versionHash: Sha256Hex };
export type CloseDto = { record: StageVersionView };
export type CancelSendRequest = CloseRequest & { acknowledgedRolesAlreadyReceived: RecipientRole[] };
export type CancelSendDto = { record: StageVersionView };

export type PaymentReceivedRequest = { j6RecordId: string; receivedOn: IsoDate; evidence: string };
