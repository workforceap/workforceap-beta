/**
 * Admin draft-PDF boundary. Stateless: no database write, no storage write, nothing persisted.
 * Identity, organization and permission come from injected server-side dependencies; the
 * request body carries only an enrollment id, a sheet period and dated minutes/codes.
 */
import { ZodError, z } from 'zod';
import { createDraft, importDatedAdminEvidence, renderAuthorizedDraft, type Actor, type Scope } from './workflow';
import type { TrustedEnrollment } from './repository';

const id = z.string().uuid();
const entry = z.object({
  date: z.string().max(10),
  minutes: z.number().int().min(0).max(1440).optional(),
  code: z.enum(['W', 'CR', 'A']).optional(),
}).strict().refine(row => (row.code === undefined) === (row.minutes !== undefined), { message: 'MINUTES_XOR_CODE' });
/** Strict: `verifiedBy`, `role`, `permissions`, `organizationId`, `memberId` etc. are rejected, not ignored. */
export const adminDraftRequestSchema = z.object({
  enrollmentId: id,
  kind: z.enum(['weekly', 'monthly', 'yearly']),
  selectedDate: z.string().max(10),
  rows: z.array(entry).min(1).max(366),
}).strict();

export type AdminDraftDeps = {
  /** Authenticated user id from the server session, or null. */
  getUserId(): Promise<string | null>;
  /** Actor with organization and permissions resolved server-side; null when the user is not an attendance admin. */
  resolveAdminActor(userId: string): Promise<Actor | null>;
  /** Must look the enrollment up inside the actor's organization only. */
  loadEnrollment(organizationId: string, enrollmentId: string): Promise<TrustedEnrollment | null>;
};
export type AdminDraftResult =
  | { status: 200; pdf: Uint8Array; headers: Record<string, string> }
  | { status: number; body: { error: string } };

const fail = (status: number, error: string): AdminDraftResult => ({ status, body: { error } });
export const DRAFT_PDF_HEADERS = Object.freeze({
  'content-type': 'application/pdf',
  'content-disposition': 'inline; filename="attendance-draft.pdf"',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
});

export async function handleAdminDraftPdf(method: string, rawBody: string, deps: AdminDraftDeps): Promise<AdminDraftResult> {
  if (method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  const userId = await deps.getUserId();
  if (!userId) return fail(401, 'UNAUTHENTICATED');
  const actor = await deps.resolveAdminActor(userId);
  if (!actor || !actor.permissions.includes('attendance:admin')) return fail(403, 'ATTENDANCE_FORBIDDEN');
  if (rawBody.length > 200_000) return fail(413, 'PAYLOAD_TOO_LARGE');
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return fail(400, 'INVALID_JSON'); }
  try {
    const body = adminDraftRequestSchema.parse(json);
    const trusted = await deps.loadEnrollment(actor.organizationId, body.enrollmentId);
    if (!trusted || trusted.scope.organizationId !== actor.organizationId || trusted.scope.enrollmentId !== body.enrollmentId) return fail(404, 'ATTENDANCE_ENROLLMENT_NOT_FOUND');
    if (!trusted.active) return fail(409, 'ATTENDANCE_ENROLLMENT_INACTIVE');
    const scope: Scope = trusted.scope;
    const evidence = importDatedAdminEvidence(actor, scope, body.rows.map((row, index) => ({
      sourceKey: `admin-entry-${index + 1}-${row.date}`,
      date: row.date,
      kind: row.code ?? 'verified-duration',
      ...(row.minutes !== undefined ? { minutes: row.minutes } : {}),
      reference: 'admin-entered-draft-request',
      reason: 'Entered by an attendance admin for an unsaved draft; not independently verified',
    })));
    const draft = createDraft(actor, scope, { kind: body.kind, selectedDate: body.selectedDate, startMonth: trusted.startMonth,
      profile: trusted.profile, enrollment: trusted.enrollment, evidence, coursera: trusted.coursera ?? null });
    return { status: 200, pdf: await renderAuthorizedDraft(actor, draft), headers: { ...DRAFT_PDF_HEADERS } };
  } catch (error) {
    if (error instanceof ZodError) return fail(400, 'INVALID_REQUEST');
    const message = error instanceof Error ? error.message : 'ERROR';
    if (message === 'ATTENDANCE_FORBIDDEN') return fail(403, message);
    if (/^(INVALID_|CONFLICTING_|AMBIGUOUS_|VERIFIER_|CODE_IS_|EVIDENCE_|UNSUPPORTED_|ENROLLMENT_START_|PARTICIPANT_|PDF_)/.test(message)) return fail(422, message);
    return fail(500, 'INTERNAL_ERROR');
  }
}
