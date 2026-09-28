import 'server-only';

/**
 * The reviewed draft workflow. `reviewDraft` accepts any subset of the
 * editable fields, validates each one and reports the case blockers without
 * writing. `saveDraft` persists a version only when the merged set is
 * complete and valid, because M1 frozen content cannot be partial; it writes
 * the record, its recipient rows (from the same normalized contacts) and the
 * audit row in one transaction.
 */
import type { Prisma } from '@prisma/client';
import { auditLog } from '@/lib/audit';
import { resolveAssignedCounselorContact } from '@/lib/billing/packetAccess';
import { prisma } from '@/lib/db/prisma';
import { CONTENT_VERSION, type BillingStage } from '../constants';
import { buildJ5Content, buildJ6Content, formatStageDocumentNumber, recipientRowsForContent, type J5Content, type J6Content } from '../content';
import { billingToday } from '../dates';
import type {
  Blocker,
  ContactSource,
  DraftField,
  DraftFieldError,
  DraftPatch,
  DraftReviewDto,
  DraftSaveDto,
  HoldReason,
  J6DraftInput,
} from '../dto';
import { isPlausibleEmail, normalizeEmail } from '../recipients';
import { printableIssue, printableIssues, RendererAdapterError, renderDraftFromContent } from '../rendererAdapter';
import { TWO_STAGE_TEXT_LIMITS } from '../documentPdf';
import { checkJ5Prerequisites, checkJ6Prerequisites } from '../stateMachine';
import type { TwoStageContext } from './access';
import { isUniqueViolation } from './access';
import { blockersFromMessages, holdBlockers } from './blockers';
import { dateColumn, j6Prerequisites, latestAttestation, loadCaseSnapshot, recordContent, stageRecords, toAttestation, type CaseSnapshot, type RecordWithRelations } from './caseData';
import { apiError } from './http';
import { readLetterheadLogo } from './logo';
import { versionView } from './summary';

type Inputs = J6DraftInput; // J5 uses the subset without finance / board invoice.
type Sourced = { value: string | null; source: ContactSource };

const STAGE_FIELDS: Readonly<Record<BillingStage, readonly DraftField[]>> = {
  j5: ['boardName', 'student.name', 'student.email', 'counselor.name', 'counselor.email', 'counselor.phone'],
  j6: ['boardName', 'student.name', 'student.email', 'counselor.name', 'counselor.email', 'counselor.phone', 'finance.name', 'finance.email', 'boardInvoiceArtifactId'],
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Validate the request body as a DraftPatch (shape only; values are checked per field). */
export function parseDraftPatch(stage: BillingStage, body: unknown): DraftPatch<'j6'> & { expectedVersionHash?: string | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
  const b = body as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
  const student = obj(b.student);
  const counselor = obj(b.counselor);
  const finance = obj(b.finance);
  const patch: DraftPatch<'j6'> & { expectedVersionHash?: string | null } = {};
  if (b.boardName !== undefined) patch.boardName = str(b.boardName) ?? '';
  if (student) patch.student = { name: str(student.name), email: str(student.email) };
  if (counselor) patch.counselor = { name: str(counselor.name), email: str(counselor.email), phone: str(counselor.phone) };
  if (stage === 'j6') {
    if (finance) patch.finance = { name: str(finance.name), email: str(finance.email) };
    if (b.boardInvoiceArtifactId !== undefined) patch.boardInvoiceArtifactId = b.boardInvoiceArtifactId === null ? null : str(b.boardInvoiceArtifactId) ?? '';
  }
  if (b.expectedVersionHash !== undefined) patch.expectedVersionHash = b.expectedVersionHash === null ? null : str(b.expectedVersionHash) ?? '';
  return patch;
}

type Base = { values: Record<DraftField, Sourced> };

function baseInputs(record: RecordWithRelations | null, member: { fullName: string; email: string }, counselor: { name: string; email: string } | null): Base {
  if (record && record.status === 'draft') {
    const c = recordContent<J5Content | J6Content>(record);
    const d = (v: string | null | undefined): Sourced => ({ value: v ?? null, source: 'draft' });
    return {
      values: {
        boardName: d(c.boardName),
        'student.name': d(c.student.name),
        'student.email': d(c.student.email),
        'counselor.name': d(c.counselor.name),
        'counselor.email': d(c.counselor.email),
        'counselor.phone': d(c.counselor.phone),
        'finance.name': d(c.kind === 'j6_invoice_cover_letter' ? c.finance.name : null),
        'finance.email': d(c.kind === 'j6_invoice_cover_letter' ? c.finance.email : null),
        boardInvoiceArtifactId: d(c.kind === 'j6_invoice_cover_letter' ? c.boardInvoice?.artifactId ?? null : null),
      },
    };
  }
  const none: Sourced = { value: null, source: 'none' };
  return {
    values: {
      boardName: none,
      'student.name': { value: member.fullName || null, source: member.fullName ? 'member_profile' : 'none' },
      'student.email': { value: member.email || null, source: member.email ? 'member_profile' : 'none' },
      'counselor.name': counselor ? { value: counselor.name, source: 'assigned_counselor' } : none,
      'counselor.email': counselor ? { value: counselor.email, source: 'assigned_counselor' } : none,
      // Always staff-entered: no counselor phone is on file anywhere.
      'counselor.phone': none,
      'finance.name': none,
      'finance.email': none,
      boardInvoiceArtifactId: none,
    },
  };
}

function applyPatch(base: Base, patch: DraftPatch<'j6'>): Record<DraftField, Sourced> {
  const v = { ...base.values };
  const set = (field: DraftField, value: string | null | undefined) => {
    if (value !== undefined) v[field] = { value: value === null ? null : value, source: 'draft' };
  };
  set('boardName', patch.boardName);
  set('student.name', patch.student?.name);
  set('student.email', patch.student?.email);
  set('counselor.name', patch.counselor?.name);
  set('counselor.email', patch.counselor?.email);
  set('counselor.phone', patch.counselor?.phone);
  set('finance.name', patch.finance?.name);
  set('finance.email', patch.finance?.email);
  if (patch.boardInvoiceArtifactId !== undefined) set('boardInvoiceArtifactId', patch.boardInvoiceArtifactId);
  return v;
}

const LIMITS: Readonly<Record<DraftField, number>> = {
  boardName: TWO_STAGE_TEXT_LIMITS.boardName,
  'student.name': TWO_STAGE_TEXT_LIMITS.personName,
  'student.email': TWO_STAGE_TEXT_LIMITS.email,
  'counselor.name': TWO_STAGE_TEXT_LIMITS.personName,
  'counselor.email': TWO_STAGE_TEXT_LIMITS.email,
  'counselor.phone': TWO_STAGE_TEXT_LIMITS.phone,
  'finance.name': TWO_STAGE_TEXT_LIMITS.personName,
  'finance.email': TWO_STAGE_TEXT_LIMITS.email,
  boardInvoiceArtifactId: 64,
};

/** Per-field validation of the merged editor values. */
export function validateFields(stage: BillingStage, values: Record<DraftField, Sourced>, snapshot: Pick<CaseSnapshot, 'artifacts'>): Partial<Record<DraftField, DraftFieldError>> {
  const errors: Partial<Record<DraftField, DraftFieldError>> = {};
  for (const f of STAGE_FIELDS[stage]) {
    const raw = values[f].value;
    if (f === 'boardInvoiceArtifactId') {
      if (raw && !snapshot.artifacts.some((a) => a.id === raw && a.kind === 'board_invoice')) {
        errors[f] = { code: 'BOARD_INVOICE_INVALID', message: 'The optional board invoice must be an uploaded board invoice of this case.' };
      }
      continue;
    }
    const value = (raw ?? '').trim();
    if (!value) {
      errors[f] = { code: 'FIELD_REQUIRED', message: 'This field is required.' };
      continue;
    }
    if (f.endsWith('.email')) {
      if (!isPlausibleEmail(value)) {
        errors[f] = { code: 'EMAIL_INVALID', message: 'Enter a valid email address.' };
        continue;
      }
    }
    const printed = f.endsWith('.email') ? normalizeEmail(value) : value.replace(/[ \t\n\v\f\r]+/gu, ' ');
    const issue = printableIssue(f, printed, LIMITS[f]);
    if (issue) errors[f] = { code: issue.code, message: issue.message };
  }
  const emails = (['student.email', 'counselor.email', 'finance.email'] as const).filter((f) => STAGE_FIELDS[stage].includes(f) && !errors[f] && values[f].value);
  const seen = new Map<string, DraftField>();
  for (const f of emails) {
    const e = normalizeEmail(values[f].value as string);
    if (seen.has(e)) errors[f] = { code: 'EMAIL_DUPLICATE', message: 'Each recipient needs their own email address.' };
    else seen.set(e, f);
  }
  return errors;
}

type Built = { ok: true; content: J5Content | J6Content; contentSha256: string; holds: HoldReason[] } | { ok: false; blockers: Blocker[] };

function toInputs(values: Record<DraftField, Sourced>): Inputs {
  const g = (f: DraftField) => values[f].value ?? '';
  return {
    boardName: g('boardName'),
    student: { name: g('student.name'), email: g('student.email') },
    counselor: { name: g('counselor.name'), email: g('counselor.email'), phone: g('counselor.phone') },
    finance: { name: g('finance.name'), email: g('finance.email') },
    boardInvoiceArtifactId: values.boardInvoiceArtifactId.value || null,
  };
}

/** Case prerequisites for creating/updating this stage's draft (independent of the editor fields). */
export function stagePrerequisiteBlockers(stage: BillingStage, snapshot: CaseSnapshot, now: Date, editing: RecordWithRelations | null, boardInvoiceArtifactId: string | null): { blockers: Blocker[]; holds: HoldReason[] } {
  if (stage === 'j5') {
    const readiness = latestAttestation(snapshot, 'j5_readiness');
    const hasOpenJ5 = stageRecords(snapshot, 'j5').some((r) => ['draft', 'signed', 'sent'].includes(r.status) && r.id !== editing?.id);
    const gate = checkJ5Prerequisites({ hasOpenJ5, readiness: readiness ? toAttestation(readiness) : null, programSlug: snapshot.billingCase.programSlug });
    return { blockers: gate.ok ? [] : blockersFromMessages(gate.errors), holds: [] };
  }
  const gate = checkJ6Prerequisites(j6Prerequisites(snapshot, { now, boardInvoiceArtifactId, editingRecordId: editing?.id ?? null }));
  return gate.ok ? { blockers: holdBlockers(gate.reviewReasons), holds: gate.reviewReasons } : { blockers: blockersFromMessages(gate.errors), holds: [] };
}

function buildContent(stage: BillingStage, snapshot: CaseSnapshot, inputs: Inputs, args: { now: Date; documentNumber: string; logoSha256: string; editing: RecordWithRelations | null }): Built {
  const issueDate = billingToday(args.now);
  const common = { documentNumber: args.documentNumber, logoSha256: args.logoSha256, issueDate, student: inputs.student, boardName: inputs.boardName, counselor: inputs.counselor };
  if (stage === 'j5') {
    const readiness = latestAttestation(snapshot, 'j5_readiness');
    if (!readiness) return { ok: false, blockers: blockersFromMessages(['Record the J5 readiness attestation (with the confirmed class start date) first.']) };
    const built = buildJ5Content({ ...common, programSlug: snapshot.billingCase.programSlug, readiness: toAttestation(readiness) });
    return built.ok ? { ok: true, content: built.content, contentSha256: built.contentSha256, holds: [] } : { ok: false, blockers: blockersFromMessages(built.errors) };
  }
  const prereq = j6Prerequisites(snapshot, { now: args.now, boardInvoiceArtifactId: inputs.boardInvoiceArtifactId, editingRecordId: args.editing?.id ?? null });
  const built = buildJ6Content({ ...prereq, ...common, finance: inputs.finance });
  return built.ok ? { ok: true, content: built.content, contentSha256: built.contentSha256, holds: built.content.reviewReasons } : { ok: false, blockers: blockersFromMessages(built.errors) };
}

/** Printability of the built content, including the one-page layout (a trial render). */
async function printableBlockers(content: J5Content | J6Content, logo: Uint8Array, now: Date): Promise<{ field: string; code: 'TEXT_NOT_PRINTABLE' | 'VOUCHER_REFERENCE_TOO_LONG'; message: string } | null> {
  const issue = printableIssues(content)[0];
  if (issue) return issue;
  if (content.kind === 'j6_invoice_cover_letter' && content.reviewReasons.length > 0) return null; // held: not rendered, cannot be signed
  try {
    await renderDraftFromContent(content, { logoPng: logo, frozenAt: now.toISOString() });
    return null;
  } catch (error) {
    if (error instanceof RendererAdapterError && (error.code === 'TEXT_NOT_PRINTABLE' || error.code === 'VOUCHER_REFERENCE_TOO_LONG')) {
      return { field: error.field ?? 'content', code: error.code, message: error.message };
    }
    throw error;
  }
}

function currentDraft(snapshot: CaseSnapshot, stage: BillingStage): RecordWithRelations | null {
  const latest = stageRecords(snapshot, stage)[0] ?? null;
  return latest?.status === 'draft' ? latest : null;
}

const PLACEHOLDER_NUMBER = 'WAP-DRAFT-PREVIEW';

async function loadForDraft<P>(ctx: TwoStageContext<P>) {
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  if (!snapshot) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
  const counselor = await resolveAssignedCounselorContact(ctx.member.id);
  return { snapshot, counselor: counselor ? { name: counselor.fullName, email: counselor.email } : null };
}

/** POST …/[stage]/draft/review — never writes. */
export async function reviewDraft<P>(ctx: TwoStageContext<P>, stage: BillingStage, patch: DraftPatch<'j6'>): Promise<DraftReviewDto> {
  const { snapshot, counselor } = await loadForDraft(ctx);
  const editing = currentDraft(snapshot, stage);
  const values = applyPatch(baseInputs(editing, ctx.member, counselor), patch);
  const fieldErrors = validateFields(stage, values, snapshot);
  const inputs = toInputs(values);
  const prereq = stagePrerequisiteBlockers(stage, snapshot, ctx.now, editing, inputs.boardInvoiceArtifactId);
  let versionHashIfSaved: string | null = null;
  let holds = prereq.holds;
  const fieldsOk = Object.keys(fieldErrors).length === 0;
  const prereqOk = prereq.blockers.every((b) => b.hardHold);
  if (fieldsOk && prereqOk) {
    const logo = await readLetterheadLogo();
    const built = buildContent(stage, snapshot, inputs, { now: ctx.now, documentNumber: editing?.documentNumber ?? PLACEHOLDER_NUMBER, logoSha256: logo.sha256, editing });
    if (built.ok) {
      holds = built.holds;
      const printIssue = await printableBlockers(built.content, logo.bytes, ctx.now);
      if (printIssue) fieldErrors[printIssue.field as DraftField] = { code: printIssue.code, message: printIssue.message };
      else if (editing) versionHashIfSaved = built.contentSha256;
    }
  }
  const fields: DraftReviewDto['fields'] = {};
  for (const f of STAGE_FIELDS[stage]) fields[f] = { value: values[f].value, source: values[f].source, error: fieldErrors[f] ?? null };
  return {
    stage,
    current: editing ? versionView(snapshot, ctx.member.id, editing, ctx.now) : null,
    fields,
    blockers: prereq.blockers,
    complete: Object.keys(fieldErrors).length === 0 && prereqOk,
    holds,
    versionHashIfSaved,
  };
}

async function nextDocumentNumber(tx: Prisma.TransactionClient, organizationId: string, stage: BillingStage, issueDate: string): Promise<string> {
  const year = Number(issueDate.slice(0, 4));
  const prefix = formatStageDocumentNumber(stage, year, 1).slice(0, -4);
  const rows = await tx.billingStageRecord.findMany({ where: { organizationId, stage, documentNumber: { startsWith: prefix } }, select: { documentNumber: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.documentNumber.slice(prefix.length)) || 0), 0);
  return formatStageDocumentNumber(stage, year, max + 1);
}

function recordData(content: J5Content | J6Content, contentSha256: string) {
  const base = {
    contentVersion: CONTENT_VERSION,
    content: content as unknown as Prisma.InputJsonValue,
    contentSha256,
    amountCents: content.totalCents,
    className: content.training.className,
    contactHours: content.training.contactHours,
    classStartDate: dateColumn(content.training.classStartDate),
    classEndDate: dateColumn(content.training.classEndDate),
  };
  if (content.kind === 'j5_quote_voucher_request') {
    return { ...base, readinessAttestationId: content.readiness.attestationId };
  }
  const prior = content.priorJ5;
  return {
    ...base,
    priorJ5Source: prior.source,
    priorJ5RecordId: prior.source === 'system' ? prior.recordId : null,
    externalJ5AttestationId: prior.source === 'external' ? prior.attestationId : null,
    reviewRequired: content.reviewReasons.length > 0,
    reviewReasons: content.reviewReasons,
    classStartAttestationId: content.classStarted.attestationId,
    voucherArtifactId: content.voucher.artifactId,
    voucherAttestationId: content.voucher.attestationId,
    boardInvoiceArtifactId: content.boardInvoice?.artifactId ?? null,
  };
}

/** PUT …/[stage]/draft — persists only a complete, validated set. */
export async function saveDraft<P>(
  ctx: TwoStageContext<P>,
  stage: BillingStage,
  patch: DraftPatch<'j6'> & { expectedVersionHash?: string | null },
): Promise<{ status: 200 | 201; body: DraftSaveDto }> {
  const { snapshot, counselor } = await loadForDraft(ctx);
  const latest = stageRecords(snapshot, stage)[0] ?? null;
  if (latest && (latest.status === 'signed' || latest.status === 'sent')) {
    throw apiError(409, 'STAGE_ALREADY_OPEN', 'This stage already has a signed or sent version. Supersede or void it first.');
  }
  const editing = latest?.status === 'draft' ? latest : null;
  if (editing && patch.expectedVersionHash !== editing.contentSha256) {
    throw apiError(409, 'DRAFT_CONFLICT', 'Someone else saved this draft. Reload it before saving again.');
  }
  const values = applyPatch(baseInputs(editing, ctx.member, counselor), patch);
  const fieldErrors = validateFields(stage, values, snapshot);
  const inputs = toInputs(values);
  const prereq = stagePrerequisiteBlockers(stage, snapshot, ctx.now, editing, inputs.boardInvoiceArtifactId);
  const prereqBlocking = prereq.blockers.filter((b) => !b.hardHold);
  if (Object.keys(fieldErrors).length > 0 || prereqBlocking.length > 0) {
    throw apiError(422, 'DRAFT_INCOMPLETE', 'Complete the highlighted fields and the steps listed before saving this draft. Nothing was saved.', {
      fields: fieldErrors,
      blockers: prereqBlocking,
    });
  }
  const logo = await readLetterheadLogo();
  const issueDate = billingToday(ctx.now);

  // From here a database write may happen; an unknown failure is OUTCOME_UNCERTAIN.
  ctx.effects.mark();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const documentNumber = editing?.documentNumber ?? (await nextDocumentNumber(tx, ctx.member.organizationId, stage, issueDate));
        const built = buildContent(stage, snapshot, inputs, { now: ctx.now, documentNumber, logoSha256: logo.sha256, editing });
        if (!built.ok) throw apiError(422, stage === 'j5' ? 'J5_PREREQUISITES_MISSING' : 'J6_PREREQUISITES_MISSING', 'Complete the steps listed before creating this document.', { blockers: built.blockers });
        const printIssue = await printableBlockers(built.content, logo.bytes, ctx.now);
        if (printIssue) throw apiError(422, printIssue.code, printIssue.message, { field: printIssue.field });
        const rows = recipientRowsForContent(built.content);
        const data = recordData(built.content, built.contentSha256);
        let recordId: string;
        if (editing) {
          const updated = await tx.billingStageRecord.updateMany({
            where: { id: editing.id, organizationId: ctx.member.organizationId, status: 'draft', contentSha256: editing.contentSha256 },
            data,
          });
          if (updated.count !== 1) throw apiError(409, 'DRAFT_CONFLICT', 'Someone else saved this draft. Reload it before saving again.');
          await tx.billingStageRecipient.deleteMany({ where: { stageRecordId: editing.id, organizationId: ctx.member.organizationId } });
          recordId = editing.id;
        } else {
          const created = await tx.billingStageRecord.create({
            data: {
              ...data,
              organizationId: ctx.member.organizationId,
              caseId: snapshot.billingCase.id,
              stage,
              version: (latest?.version ?? 0) + 1,
              supersedesRecordId: latest?.id ?? null,
              status: 'draft',
              documentNumber,
              createdBySubjectId: ctx.user.id,
            },
          });
          recordId = created.id;
        }
        await tx.billingStageRecipient.createMany({
          data: rows.map((r) => ({ stageRecordId: recordId, organizationId: ctx.member.organizationId, stage, recipientRole: r.role, recipientName: r.name, email: r.email, phone: r.phone })),
        });
        await auditLog(
          {
            actorUserId: ctx.user.id,
            action: 'billing.two_stage.draft_saved',
            targetType: 'billing_stage_record',
            targetId: recordId,
            metadata: { caseId: snapshot.billingCase.id, stage, version: editing?.version ?? (latest?.version ?? 0) + 1, contentSha256: built.contentSha256, created: !editing },
          },
          tx,
        );
        return { recordId, contentSha256: built.contentSha256, holds: built.holds };
      });
      const fresh = await loadCaseSnapshot(prisma, ctx.member.organizationId, snapshot.billingCase.id);
      const record = fresh?.records.find((r) => r.id === result.recordId);
      if (!fresh || !record) throw new Error('saved draft not found');
      return { status: editing ? 200 : 201, body: { created: !editing, record: versionView(fresh, ctx.member.id, record, ctx.now), versionHash: result.contentSha256, holds: result.holds } };
    } catch (error) {
      if (!editing && isUniqueViolation(error) && attempt < 2) continue; // document number race: allocate again
      throw error;
    }
  }
  throw new Error('document number allocation did not converge');
}
