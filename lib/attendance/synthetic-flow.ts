/**
 * LOCAL SYNTHETIC orchestration: entry/import -> draft selection -> inline preview bytes.
 * Non-durable. Accepts identifiers and entry DTOs only; actor comes from the caller's
 * trusted boundary; profile/enrollment/evidence come from the repository.
 */
import { z } from 'zod';
import { periodDates } from './evidence';
import type { AttendanceEvidenceRepository } from './repository';
import { SYNTHETIC_LABEL } from './synthetic-fixtures';
import { authorize, createDraft, renderAuthorizedDraft, type Actor } from './workflow';

const id = z.string().uuid();
const scopeIds = { organizationId: id, memberId: id, enrollmentId: id };

export const previewRequestSchema = z.object({
  ...scopeIds,
  kind: z.enum(['weekly', 'monthly', 'yearly']),
  selectedDate: z.string().max(10),
}).strict();

export const importRequestSchema = z.object({
  ...scopeIds,
  expectedRevision: z.number().int().min(0),
  rows: z.array(z.unknown()).min(1).max(1000),
}).strict();

export async function runSyntheticPreview(repo: AttendanceEvidenceRepository, actor: Actor, input: unknown) {
  const body = previewRequestSchema.parse(input);
  const scope = { organizationId: body.organizationId, memberId: body.memberId, enrollmentId: body.enrollmentId };
  authorize(actor, scope);
  const trusted = repo.getTrustedEnrollment(scope);
  if (!trusted) throw new Error('ATTENDANCE_ENROLLMENT_NOT_FOUND');
  if (!trusted.active) throw new Error('ATTENDANCE_ENROLLMENT_INACTIVE');
  const dates = periodDates(body.kind, body.selectedDate, trusted.startMonth);
  const inPeriod = new Set(dates);
  const evidence = repo.listCurrentEvidence(scope).filter(row => inPeriod.has(row.date));
  const draft = createDraft(actor, scope, {
    kind: body.kind, selectedDate: body.selectedDate, startMonth: trusted.startMonth,
    profile: trusted.profile, enrollment: trusted.enrollment, evidence,
  });
  const { draftId } = repo.saveDraft(scope, draft);
  const pdf = await renderAuthorizedDraft(actor, draft);
  return {
    label: SYNTHETIC_LABEL, durable: false as const, draftId, hash: draft.hash,
    evidenceRevision: repo.currentRevision(scope), pdfBase64: Buffer.from(pdf).toString('base64'),
  };
}

export function runSyntheticImport(repo: AttendanceEvidenceRepository, actor: Actor, input: unknown) {
  const body = importRequestSchema.parse(input);
  const scope = { organizationId: body.organizationId, memberId: body.memberId, enrollmentId: body.enrollmentId };
  authorize(actor, scope, true);
  return { label: SYNTHETIC_LABEL, durable: false as const, ...repo.appendEvidence(actor, scope, body.rows, body.expectedRevision) };
}
