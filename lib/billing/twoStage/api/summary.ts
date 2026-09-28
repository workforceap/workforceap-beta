import 'server-only';

/**
 * Builds the authoritative case summary (CaseSummaryDto) from a loaded case
 * snapshot with the pure M1 functions. Advisory only: every mutation re-runs
 * every check. No I/O.
 */
import type { BillingArtifact, BillingAttestation, BillingPaymentEvent } from '@prisma/client';
import type { BillingStage } from '../constants';
import type { J5Content, J6Content } from '../content';
import { billingToday, classEndDate, compareIsoDates } from '../dates';
import type {
  ArtifactView,
  Blocker,
  CaseListItemDto,
  CaseSummaryDto,
  ContactField,
  ContactView,
  CounselorContactView,
  GateName,
  GateState,
  HoldReason,
  J5ReadinessKey,
  J5StageView,
  J6ReadinessKey,
  J6StageView,
  PaymentDto,
  RoleDeliveryView,
  StageVersionView,
  TwoStageBillingReadiness,
  VoucherAttestationView,
  VoucherMatch,
  VoucherReceiptAttestationView,
} from '../dto';
import { resolveProgramTerms } from '../hours';
import { formatUsdCents } from '../lineItem';
import { casePaymentView, type PaymentEvent } from '../payment';
import { STAGE_RECIPIENT_ROLES, type RecipientRole } from '../recipients';
import { decideClaim, IDEMPOTENCY_SAFE_RETRY_MS, markStaleClaimAmbiguous, rolesThatReceivedEarlierVersions, type SendStatus } from '../sendClaims';
import { checkJ5Prerequisites, checkJ6Prerequisites, summarizeCase, type StageStatus } from '../stateMachine';
import { VOUCHER_REFERENCE_MAX } from '../rendererAdapter';
import {
  blockersFromMessages,
  holdBlockers,
  J6_ISSUE_DATE_NOT_TODAY_MESSAGE,
  RECEIVING_SIGNATURE_NOT_ATTESTED_MESSAGE,
  VOUCHER_RECEIPT_FUTURE_MESSAGE,
} from './blockers';
import {
  actor,
  currentVoucher,
  isoDate,
  j6Prerequisites,
  latestAttestation,
  latestRecord,
  priorQuote,
  receiptSignatureState,
  recordContent,
  stageRecords,
  toAttestation,
  type CaseSnapshot,
  type RecordWithRelations,
} from './caseData';

export type SummaryInput = {
  snapshot: CaseSnapshot;
  memberId: string;
  member: { fullName: string; email: string };
  assignedCounselor: { name: string; email: string } | null;
  gates: Record<GateName, GateState>;
  viewerIsExecutiveSigner: boolean;
  now: Date;
};

export function basePath(memberId: string, caseId: string): string {
  return `/api/admin/members/${memberId}/billing/two-stage/cases/${caseId}`;
}

export function artifactView(snapshot: CaseSnapshot, memberId: string, row: BillingArtifact): ArtifactView {
  return {
    id: row.id,
    kind: row.kind as ArtifactView['kind'],
    source: row.source as ArtifactView['source'],
    fileName: row.fileName,
    byteLength: row.byteLength,
    sha256: row.sha256,
    createdBy: actor(snapshot, row.createdBySubjectId),
    createdAt: row.createdAt.toISOString(),
    downloadPath: `${basePath(memberId, snapshot.billingCase.id)}/files/${row.id}`,
  };
}

function nextAction(status: SendStatus | null, claimedAt: Date | null, lastClaimedAt: Date | null, now: Date): RoleDeliveryView['nextAction'] {
  if (!status || !claimedAt || !lastClaimedAt) return 'send';
  const row = { role: 'student' as const, status, claimedAt, lastClaimedAt };
  let decision = decideClaim(row, now).action;
  // A stale pending claim is first marked ambiguous by the send/reconcile route; decide as if it already were.
  if (decision === 'mark_ambiguous') decision = decideClaim({ ...row, status: markStaleClaimAmbiguous(row, now) ?? 'ambiguous' }, now).action;
  switch (decision) {
    case 'skip_delivered':
      return 'none';
    case 'retry_same_key':
      return 'retry_same_key';
    case 'needs_reconciliation':
      return 'reconcile';
    case 'new_attempt_required':
      return 'new_attempt_on_request';
    case 'in_flight':
      return 'in_flight';
    default:
      return 'send';
  }
}

export function deliveryViews(snapshot: CaseSnapshot, record: RecordWithRelations, now: Date): RoleDeliveryView[] {
  if (record.status === 'draft') return [];
  return STAGE_RECIPIENT_ROLES[record.stage as BillingStage].map((role) => {
    const recipient = record.recipients.find((r) => r.recipientRole === role);
    const sends = record.sends.filter((s) => s.recipientRole === role).sort((a, b) => a.attemptNo - b.attemptNo);
    const latest = sends.at(-1) ?? null;
    const events = sends.flatMap((s) => s.deliveryEvents);
    const status = (latest?.status ?? null) as SendStatus | null;
    return {
      role,
      name: recipient?.recipientName ?? '',
      email: recipient?.email ?? '',
      latest: latest && {
        sendId: latest.id,
        attemptNo: latest.attemptNo,
        status: latest.status as SendStatus,
        claimedAt: latest.claimedAt.toISOString(),
        lastClaimedAt: latest.lastClaimedAt.toISOString(),
        acceptedAt: latest.acceptedAt?.toISOString() ?? null,
        providerMessageId: latest.providerMessageId,
        reconciled:
          latest.reconciledAt && latest.reconciledBySubjectId
            ? { at: latest.reconciledAt.toISOString(), by: actor(snapshot, latest.reconciledBySubjectId), note: latest.reconcileNote ?? '' }
            : null,
      },
      nextAction: record.status === 'signed' ? nextAction(status, latest?.claimedAt ?? null, latest?.lastClaimedAt ?? null, now) : status ? 'none' : 'send',
      retryWindowEndsAt: latest && (status === 'ambiguous' || status === 'pending') ? new Date(latest.claimedAt.getTime() + IDEMPOTENCY_SAFE_RETRY_MS).toISOString() : null,
      deliveryEvents: events.map((e) => ({ kind: e.kind as 'delivered' | 'bounced' | 'complained', occurredAt: e.occurredAt.toISOString(), source: e.source })),
      followUp: events.some((e) => e.kind === 'bounced' || e.kind === 'complained'),
    };
  });
}

export function voucherAttestationView(snapshot: CaseSnapshot, row: BillingAttestation): VoucherAttestationView {
  return {
    attestationId: row.id,
    voucherReference: row.voucherReference ?? '',
    receivedOn: isoDate(row.receivedOn) ?? '',
    authorizedAmountCents: row.authorizedAmountCents ?? 0,
    authorizedProgramSlug: row.authorizedProgramSlug ?? '',
    authorizedClassName: row.authorizedClassName ?? '',
    authorizedStartDate: isoDate(row.authorizedStartDate) ?? '',
    authorizedEndDate: isoDate(row.authorizedEndDate) ?? '',
    attestedBy: actor(snapshot, row.attestedBySubjectId),
    attestedAt: row.attestedAt.toISOString(),
    statement: row.statement,
    evidenceReference: row.evidenceReference,
  };
}

export function versionView(snapshot: CaseSnapshot, memberId: string, record: RecordWithRelations, now: Date): StageVersionView {
  const signedArtifact = record.signedArtifactId ? snapshot.artifacts.find((f) => f.id === record.signedArtifactId) : undefined;
  const closedAt = record.supersededAt ?? record.voidedAt;
  return {
    recordId: record.id,
    version: record.version,
    status: record.status as StageStatus,
    documentNumber: record.documentNumber,
    versionHash: record.contentSha256,
    issueDate: (recordContent<J5Content>(record).issueDate ?? '') as string,
    training: {
      programSlug: snapshot.billingCase.programSlug,
      className: record.className,
      contactHours: record.contactHours as 160 | 200,
      classStartDate: isoDate(record.classStartDate) ?? '',
      classEndDate: isoDate(record.classEndDate) ?? '',
    },
    amountCents: 750000,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: actor(snapshot, record.createdBySubjectId),
    signed:
      record.signedAt && record.signedBySubjectId && signedArtifact
        ? { signedAt: record.signedAt.toISOString(), signedBy: actor(snapshot, record.signedBySubjectId), signatureMethod: 'typed_attestation', artifact: artifactView(snapshot, memberId, signedArtifact) }
        : null,
    sentAt: record.sentAt?.toISOString() ?? null,
    recipients: STAGE_RECIPIENT_ROLES[record.stage as BillingStage].flatMap((role) => {
      const r = record.recipients.find((x) => x.recipientRole === role);
      return r ? [{ role, name: r.recipientName, email: r.email, phone: r.phone }] : [];
    }),
    delivery: deliveryViews(snapshot, record, now),
    closed:
      (record.status === 'superseded' || record.status === 'voided') && closedAt
        ? {
            status: record.status,
            at: closedAt.toISOString(),
            by: record.closedBySubjectId ? actor(snapshot, record.closedBySubjectId) : null,
            reason: record.closeReason,
            acceptedRolesAtClose: record.acceptedRolesAtClose as RecipientRole[],
            partialSendCancellation:
              record.sendCancelledAt && record.sendCancelledBySubjectId
                ? { at: record.sendCancelledAt.toISOString(), by: actor(snapshot, record.sendCancelledBySubjectId), reason: record.sendCancelReason ?? '' }
                : null,
          }
        : null,
  };
}

const field = (value: string | null | undefined, source: ContactField['source']): ContactField =>
  value ? { value, source } : { value: null, source: 'none' };

function contactFromRecord(record: RecordWithRelations | null, role: RecipientRole): { name: ContactField; email: ContactField; phone: ContactField } | null {
  const r = record?.recipients.find((x) => x.recipientRole === role);
  if (!record || !r) return null;
  const source = record.status === 'draft' ? 'draft' : 'frozen_snapshot';
  return { name: field(r.recipientName, source), email: field(r.email, source), phone: field(r.phone, source) };
}

function contacts(input: SummaryInput, record: RecordWithRelations | null) {
  const student: ContactView = contactFromRecord(record, 'student') ?? { name: field(input.member.fullName, 'member_profile'), email: field(input.member.email, 'member_profile') };
  const counselorRow = contactFromRecord(record, 'counselor');
  const counselor: CounselorContactView = counselorRow ?? {
    name: field(input.assignedCounselor?.name, 'assigned_counselor'),
    email: field(input.assignedCounselor?.email, 'assigned_counselor'),
    phone: { value: null, source: 'none' },
  };
  const financeRow = contactFromRecord(record, 'finance');
  const finance: ContactView = financeRow ? { name: financeRow.name, email: financeRow.email } : { name: field(null, 'none'), email: field(null, 'none') };
  return {
    student: { name: student.name, email: student.email },
    counselor,
    finance,
  };
}

function gateBlockers(gates: Record<GateName, GateState>, names: readonly GateName[]): Blocker[] {
  return names.flatMap((name) => {
    const g = gates[name];
    return !g.enabled && g.code ? [{ code: g.code, message: g.message ?? '', hardHold: false }] : [];
  });
}

function draftContactReadiness(record: RecordWithRelations | null): Partial<Record<'boardConfirmed' | 'counselorContactVerified' | 'studentEmailVerified' | 'financeContactVerified', boolean>> {
  if (!record) return {};
  const content = recordContent<J5Content | J6Content>(record);
  const row = (role: RecipientRole) => record.recipients.find((r) => r.recipientRole === role);
  const counselor = row('counselor');
  const out: ReturnType<typeof draftContactReadiness> = {
    boardConfirmed: Boolean(content.boardName?.trim()),
    counselorContactVerified: Boolean(counselor?.recipientName && counselor.email && counselor.phone?.trim()),
    studentEmailVerified: Boolean(row('student')?.email),
  };
  if (record.stage === 'j6') {
    const finance = row('finance');
    out.financeContactVerified = Boolean(finance?.recipientName && finance.email);
  }
  return out;
}

function j5View(input: SummaryInput): { view: J5StageView; readiness: Partial<Record<J5ReadinessKey, boolean>> } {
  const { snapshot, now } = input;
  const records = stageRecords(snapshot, 'j5');
  const current = records[0] ?? null;
  const readinessRow = latestAttestation(snapshot, 'j5_readiness');
  const terms = resolveProgramTerms(snapshot.billingCase.programSlug);
  const editing = current?.status === 'draft' ? current.id : null;
  const hasOpenJ5 = records.some((r) => ['draft', 'signed', 'sent'].includes(r.status) && r.id !== editing);
  const gate = checkJ5Prerequisites({ hasOpenJ5, readiness: readinessRow ? toAttestation(readinessRow) : null, programSlug: snapshot.billingCase.programSlug });
  const blockers: Blocker[] = gate.ok ? [] : blockersFromMessages(gate.errors);
  if (!current || current.status === 'superseded' || current.status === 'voided') blockers.push({ code: 'DRAFT_MISSING', message: 'Save a draft first.', hardHold: false });
  const signBlockers = current?.status === 'draft' ? gateBlockers(input.gates, ['signing', 'signedRenderer']) : [];
  const sendBlockers = current?.status === 'signed' ? gateBlockers(input.gates, ['realEmail']) : [];
  const readinessAttestation = readinessRow && readinessRow.classStartDate
    ? {
        attestationId: readinessRow.id,
        attestedBy: actor(snapshot, readinessRow.attestedBySubjectId),
        attestedAt: readinessRow.attestedAt.toISOString(),
        statement: readinessRow.statement,
        evidenceReference: readinessRow.evidenceReference,
        studentReadyConfirmed: true as const,
        counselorRequest: {
          requestedBy: readinessRow.counselorRequestedBy ?? '',
          requestedOn: isoDate(readinessRow.counselorRequestedOn) ?? '',
          reference: readinessRow.counselorRequestReference ?? '',
        },
        confirmedClassStartDate: isoDate(readinessRow.classStartDate) ?? '',
        quotedClassEndDate: classEndDate(isoDate(readinessRow.classStartDate) as string),
      }
    : null;
  const allBlockers = [...blockers, ...signBlockers, ...sendBlockers];
  const view: J5StageView = {
    current: current ? versionView(snapshot, input.memberId, current, now) : null,
    history: records.slice(1).map((r) => versionView(snapshot, input.memberId, r, now)),
    rolesThatReceivedEarlierVersions: rolesThatReceivedEarlierVersions(records.slice(1).map((r) => ({ version: r.version, acceptedRolesAtClose: r.acceptedRolesAtClose as RecipientRole[] }))),
    blockers: allBlockers,
    canSaveDraft: !current || current.status === 'draft' || current.status === 'superseded' || current.status === 'voided',
    canSign: current?.status === 'draft' && gate.ok && signBlockers.length === 0 && input.viewerIsExecutiveSigner,
    canSend: current?.status === 'signed' && sendBlockers.length === 0,
    readinessAttestation,
    programTerms: terms.ok
      ? { ok: true, programSlug: terms.canonicalSlug, className: terms.className, contactHours: terms.hours }
      : { ok: false, code: 'PROGRAM_TERMS_UNAVAILABLE', message: terms.message },
    contacts: (() => {
      const c = contacts(input, current);
      return { student: c.student, counselor: c.counselor };
    })(),
  };
  const readiness: Partial<Record<J5ReadinessKey, boolean>> = {
    studentApprovedAndReady: readinessRow?.studentReadyConfirmed === true,
    counselorRequestedQuote: Boolean(readinessRow?.counselorRequestedBy?.trim() && readinessRow.counselorRequestedOn && readinessRow.counselorRequestReference?.trim()),
    programAndClassDatesConfirmed: Boolean(readinessRow?.classStartDate) && terms.ok,
    ...draftContactReadiness(current),
  };
  return { view, readiness };
}

function matchesFor(content: { training: J6Content['training']; priorJ5: J6Content['priorJ5'] | null }, voucher: BillingAttestation): VoucherMatch[] {
  const t = content.training;
  const authStart = isoDate(voucher.authorizedStartDate) ?? '';
  const authEnd = isoDate(voucher.authorizedEndDate) ?? '';
  const amount = voucher.authorizedAmountCents ?? 0;
  const inPeriod = authStart && authEnd && compareIsoDates(t.classStartDate, authStart) >= 0 && compareIsoDates(t.classEndDate, authEnd) <= 0;
  const quote = content.priorJ5;
  const quoted = quote?.source === 'system' ? `${quote.estimate.className}, ${quote.estimate.contactHours} h` : quote ? quote.className : '';
  const quoteOk = quote?.source === 'system'
    ? quote.estimate.programSlug === t.programSlug && quote.estimate.className === t.className && quote.estimate.contactHours === t.contactHours
    : quote ? quote.programSlug === t.programSlug && quote.className === t.className : false;
  const row = (check: VoucherMatch['check'], ok: boolean, expected: string, actual: string, reasonCode: HoldReason): VoucherMatch => ({
    check,
    result: ok ? 'ok' : 'mismatch',
    expected,
    actual,
    reasonCode,
    hardHold: true,
  });
  return [
    row('amount', amount === 750_000, formatUsdCents(750_000), Number.isSafeInteger(amount) && amount >= 0 ? formatUsdCents(amount) : String(amount), 'voucher_amount_differs'),
    row('program', voucher.authorizedProgramSlug === t.programSlug, t.programSlug, voucher.authorizedProgramSlug ?? '', 'voucher_class_differs'),
    row('class', voucher.authorizedClassName === t.className, t.className, voucher.authorizedClassName ?? '', 'voucher_class_differs'),
    row('period', Boolean(inPeriod), `${t.classStartDate} – ${t.classEndDate} within the voucher period`, `voucher period ${authStart} – ${authEnd}`, 'voucher_period_conflict'),
    row('contract_end_date', t.classEndDate === classEndDate(t.classStartDate), classEndDate(t.classStartDate), t.classEndDate, 'end_date_not_contract'),
    row('prior_quote', quoteOk, quoted, `${t.className}, ${t.contactHours} h`, 'class_differs_from_quote'),
  ];
}

function j6View(input: SummaryInput): { view: J6StageView; readiness: Partial<Record<J6ReadinessKey, boolean>> } {
  const { snapshot, now } = input;
  const records = stageRecords(snapshot, 'j6');
  const current = records[0] ?? null;
  const editingDraft = current?.status === 'draft' ? current : null;
  const currentContent = current ? recordContent<J6Content>(current) : null;
  const prereq = j6Prerequisites(snapshot, { now, boardInvoiceArtifactId: editingDraft ? currentContent?.boardInvoice?.artifactId ?? null : null, editingRecordId: editingDraft?.id ?? null });
  const gate = checkJ6Prerequisites(prereq);
  const blockers: Blocker[] = gate.ok ? holdBlockers(gate.reviewReasons) : blockersFromMessages(gate.errors);
  const voucher = currentVoucher(snapshot);
  const today = billingToday(now);
  const voucherAttestation = voucher?.attestation ?? null;
  const receivedOn = voucherAttestation ? isoDate(voucherAttestation.receivedOn) : null;
  if (receivedOn && compareIsoDates(receivedOn, today) > 0) blockers.push({ code: 'J6_VOUCHER_RECEIPT_FUTURE', message: VOUCHER_RECEIPT_FUTURE_MESSAGE, hardHold: false });
  const receiptState = receiptSignatureState(snapshot);
  const receipt: VoucherReceiptAttestationView | null = receiptState?.valid
    ? {
        attestationId: receiptState.valid.id,
        artifactId: receiptState.valid.voucherArtifactId,
        sha256: receiptState.valid.voucherSha256,
        attestedBy: actor(snapshot, receiptState.valid.attestedByUserId),
        attestedAt: receiptState.valid.attestedAt.toISOString(),
        method: receiptState.valid.method as VoucherReceiptAttestationView['method'],
      }
    : null;
  if (!receipt) blockers.push({ code: 'RECEIVING_SIGNATURE_NOT_ATTESTED', message: RECEIVING_SIGNATURE_NOT_ATTESTED_MESSAGE, hardHold: false });
  if (!current || current.status === 'superseded' || current.status === 'voided') blockers.push({ code: 'DRAFT_MISSING', message: 'Save a draft first.', hardHold: false });
  if (current?.status === 'draft' && currentContent && currentContent.issueDate !== today) {
    blockers.push({ code: 'J6_ISSUE_DATE_NOT_TODAY', message: J6_ISSUE_DATE_NOT_TODAY_MESSAGE, hardHold: false });
  }
  const signBlockers = current?.status === 'draft' ? gateBlockers(input.gates, ['signing', 'signedRenderer', 'receiptSignaturePrincipal']) : [];
  const sendBlockers = current?.status === 'signed' ? gateBlockers(input.gates, ['realEmail', 'receiptSignaturePrincipal']) : [];
  const classStartedRow = latestAttestation(snapshot, 'class_started');
  const prior = priorQuote(snapshot);
  const external = prior?.source === 'external' ? latestAttestation(snapshot, 'external_j5_reference') : null;
  const holds: HoldReason[] = gate.ok ? gate.reviewReasons : [];
  const voucherAttestationRows = snapshot.attestations.filter((a) => a.kind === 'voucher_board_signed' && a.artifactId === voucher?.artifact.id);
  const voucherView: J6StageView['voucher'] = voucher
    ? {
        artifact: artifactView(snapshot, input.memberId, voucher.artifact),
        attestation: voucherAttestation ? voucherAttestationView(snapshot, voucherAttestation) : null,
        receiptAttestation: receipt,
        earlierAttestations: voucherAttestationRows
          .filter((a) => a.id !== voucherAttestation?.id)
          .map((a) => ({ attestationId: a.id, attestedAt: a.attestedAt.toISOString(), attestedBy: actor(snapshot, a.attestedBySubjectId) })),
      }
    : null;
  const invoiceRow = snapshot.artifacts.find((f) => f.kind === 'board_invoice') ?? null;
  const allBlockers = [...blockers, ...signBlockers, ...sendBlockers];
  const terms = gate.ok ? gate.training : null;
  const c = contacts(input, current);
  const view: J6StageView = {
    current: current ? versionView(snapshot, input.memberId, current, now) : null,
    history: records.slice(1).map((r) => versionView(snapshot, input.memberId, r, now)),
    rolesThatReceivedEarlierVersions: rolesThatReceivedEarlierVersions(records.slice(1).map((r) => ({ version: r.version, acceptedRolesAtClose: r.acceptedRolesAtClose as RecipientRole[] }))),
    blockers: allBlockers,
    canSaveDraft: !current || current.status === 'draft' || current.status === 'superseded' || current.status === 'voided',
    canSign: current?.status === 'draft' && gate.ok && holds.length === 0 && Boolean(receipt) && signBlockers.length === 0 && input.viewerIsExecutiveSigner,
    canSend: current?.status === 'signed' && sendBlockers.length === 0,
    priorQuote:
      prior?.source === 'system'
        ? (() => {
            const rec = snapshot.records.find((r) => r.id === prior.j5.recordId)!;
            return { source: 'system' as const, recordId: rec.id, version: rec.version, documentNumber: rec.documentNumber, status: rec.status as StageStatus, sentAt: rec.sentAt?.toISOString() ?? null, estimate: { ...prior.j5.content.training } };
          })()
        : external
          ? {
              source: 'external' as const,
              attestationId: external.id,
              reference: external.externalReference ?? '',
              quoteDate: isoDate(external.externalQuoteDate) ?? '',
              programSlug: external.quotedProgramSlug ?? '',
              className: external.quotedClassName ?? '',
              copy: (() => {
                const f = external.artifactId ? snapshot.artifacts.find((x) => x.id === external.artifactId) : undefined;
                return f ? artifactView(snapshot, input.memberId, f) : null;
              })(),
              attestedBy: actor(snapshot, external.attestedBySubjectId),
              attestedAt: external.attestedAt.toISOString(),
            }
          : null,
    classStarted: classStartedRow
      ? {
          attestationId: classStartedRow.id,
          classStartDate: isoDate(classStartedRow.classStartDate) ?? '',
          classEndDate: isoDate(classStartedRow.classEndDate) ?? '',
          attestedBy: actor(snapshot, classStartedRow.attestedBySubjectId),
          attestedAt: classStartedRow.attestedAt.toISOString(),
          evidenceReference: classStartedRow.evidenceReference,
          startedOnOrBeforeToday: Boolean(classStartedRow.classStartDate) && compareIsoDates(isoDate(classStartedRow.classStartDate)!, today) <= 0,
        }
      : null,
    voucher: voucherView,
    boardInvoice: invoiceRow ? artifactView(snapshot, input.memberId, invoiceRow) : null,
    matches: terms && voucherAttestation ? matchesFor({ training: terms, priorJ5: gate.ok ? gate.priorJ5 : null }, voucherAttestation) : null,
    holds,
    variance: gate.ok ? gate.variance : null,
    contacts: { finance: c.finance, counselor: c.counselor, student: c.student },
  };
  const voucherRef = voucherAttestation?.voucherReference?.trim() ?? '';
  const readiness: Partial<Record<J6ReadinessKey, boolean>> = {
    priorQuoteVerified: prior !== null && (prior.source === 'system' || Boolean(external?.externalReference && external.externalQuoteDate && external.quotedProgramSlug && external.quotedClassName)),
    ...(voucher
      ? {
          voucherReferenceAndReceivedDateVerified: Boolean(voucherRef) && voucherRef.length <= VOUCHER_REFERENCE_MAX && Boolean(receivedOn),
          originalVoucherHashVerified: /^[0-9a-f]{64}$/u.test(voucher.artifact.sha256) && Boolean(voucher.artifact.createdBySubjectId),
          // Only the signer principal's attestation on this exact hash counts; the staff flag never does.
          michaelReceivingSignatureAttested: Boolean(receipt),
          voucherTermsVerified: gate.ok ? !gate.reviewReasons.some((r) => r === 'voucher_amount_differs' || r === 'voucher_class_differs' || r === 'voucher_period_conflict') : false,
        }
      : { originalVoucherHashVerified: false, michaelReceivingSignatureAttested: false }),
    ...(classStartedRow ? { classStarted: view.classStarted?.startedOnOrBeforeToday ?? false } : {}),
    ...(classStartedRow ? { programAndClassDatesConfirmed: gate.ok ? !gate.reviewReasons.includes('end_date_not_contract') : false } : {}),
    ...draftContactReadiness(current),
  };
  return { view, readiness };
}

function paymentDto(snapshot: CaseSnapshot, now: Date): PaymentDto {
  const everSent = new Set(snapshot.records.filter((r) => r.stage === 'j6' && r.sentAt).map((r) => r.id));
  const events = snapshot.paymentEvents.filter((e) => everSent.has(e.j6RecordId));
  const asM1 = events.map((e) => toPaymentEvent(e));
  return {
    ...casePaymentView(asM1, now),
    events: events.map((e) => ({
      status: e.status as 'pending' | 'received',
      j6RecordId: e.j6RecordId,
      recordedAt: e.recordedAt.toISOString(),
      recordedBy: actor(snapshot, e.recordedBySubjectId),
      ...(e.expectedFollowUpFrom ? { expectedFollowUpFrom: isoDate(e.expectedFollowUpFrom)! } : {}),
      ...(e.expectedFollowUpTo ? { expectedFollowUpTo: isoDate(e.expectedFollowUpTo)! } : {}),
      ...(e.receivedOn ? { receivedOn: isoDate(e.receivedOn)! } : {}),
      ...(e.evidence ? { evidence: e.evidence } : {}),
    })),
  };
}

export function toPaymentEvent(e: BillingPaymentEvent): PaymentEvent & { j6RecordId: string } {
  return e.status === 'received'
    ? { status: 'received', receivedOn: isoDate(e.receivedOn) ?? '', evidence: e.evidence ?? '', recordedAt: e.recordedAt.toISOString(), j6RecordId: e.j6RecordId }
    : { status: 'pending', expectedFollowUpFrom: isoDate(e.expectedFollowUpFrom) ?? '', expectedFollowUpTo: isoDate(e.expectedFollowUpTo) ?? '', recordedAt: e.recordedAt.toISOString(), j6RecordId: e.j6RecordId };
}

export function casePaymentDto(snapshot: CaseSnapshot, now: Date): PaymentDto {
  return paymentDto(snapshot, now);
}

export function caseProgress(snapshot: CaseSnapshot) {
  return summarizeCase({
    records: snapshot.records.map((r) => ({ id: r.id, stage: r.stage as BillingStage, status: r.status as StageStatus, version: r.version, sentAt: r.sentAt })),
    hasVoucherAttestation: currentVoucher(snapshot) !== null,
    paymentEvents: snapshot.paymentEvents.map((e) => ({ j6RecordId: e.j6RecordId, status: e.status as 'pending' | 'received', recordedAt: e.recordedAt.toISOString() })),
  });
}

export function caseListItem(snapshot: CaseSnapshot): CaseListItemDto {
  const terms = resolveProgramTerms(snapshot.billingCase.programSlug);
  return {
    id: snapshot.billingCase.id,
    programSlug: snapshot.billingCase.programSlug,
    className: terms.ok ? terms.className : null,
    createdAt: snapshot.billingCase.createdAt.toISOString(),
    progress: caseProgress(snapshot),
  };
}

/**
 * #2706 passes one readiness object to both cards. Its four shared keys
 * (board, counselor, student email, class dates) come from the J6 once the
 * case has a prior quote, and from the J5 before that.
 */
export function combinedReadiness(
  j5: Partial<Record<J5ReadinessKey, boolean>>,
  j6: Partial<Record<J6ReadinessKey, boolean>>,
  j6Active: boolean,
): TwoStageBillingReadiness {
  return j6Active ? { ...j5, ...j6 } : { ...j6, ...j5 };
}

export function buildCaseSummary(input: SummaryInput): CaseSummaryDto {
  const { snapshot, now } = input;
  const terms = resolveProgramTerms(snapshot.billingCase.programSlug);
  const j5 = j5View(input);
  const j6 = j6View(input);
  const j6Active = priorQuote(snapshot) !== null;
  return {
    case: {
      id: snapshot.billingCase.id,
      programSlug: snapshot.billingCase.programSlug,
      className: terms.ok ? terms.className : null,
      contactHours: terms.ok ? terms.hours : null,
      createdAt: snapshot.billingCase.createdAt.toISOString(),
      createdBy: actor(snapshot, snapshot.billingCase.createdBySubjectId),
    },
    progress: caseProgress(snapshot),
    gates: input.gates,
    viewer: { isExecutiveSigner: input.viewerIsExecutiveSigner },
    j5: j5.view,
    j6: j6.view,
    payment: paymentDto(snapshot, now),
    readiness: combinedReadiness(j5.readiness, j6.readiness, j6Active),
    readinessByStage: { j5: j5.readiness, j6: j6.readiness },
  };
}

export { latestRecord };
