import { z } from 'zod';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize, validateEvidence, type Evidence, type SheetKind } from './evidence';
import { type AttendanceSnapshot, renderAttendancePdf } from './pdf';

// These values must come from the existing server auth/enrollment repositories,
// never request JSON. No HTTP routes or production repository are wired yet.
const id = z.string().uuid();
const scopeSchema = z.object({ organizationId: id, memberId: id, enrollmentId: id }).strict();
export type Scope = z.infer<typeof scopeSchema>;
export type Actor = { userId: string; organizationId: string; permissions: readonly string[] };
export function authorize(actor: Actor, scope: Scope, adminOnly = false): void {
  scopeSchema.parse(scope);
  id.parse(actor.userId);
  id.parse(actor.organizationId);
  if (actor.organizationId !== scope.organizationId ||
    !(actor.permissions.includes('attendance:admin') || (!adminOnly && actor.userId === scope.memberId))) {
    throw new Error('ATTENDANCE_FORBIDDEN');
  }
}
const FORBIDDEN_ROW_KEYS = new Set(['verifiedBy', '__proto__', 'constructor', 'prototype']);
function assertPlainImportRows(input: unknown): void {
  const rows = z.array(z.unknown()).min(1).max(1000).parse(input);
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new Error('UNSUPPORTED_ROW_SHAPE');
    if (Object.getPrototypeOf(row) !== Object.prototype) throw new Error('UNSUPPORTED_ROW_SHAPE');
    for (const key of Reflect.ownKeys(row)) {
      if (typeof key !== 'string') throw new Error('UNSUPPORTED_ROW_PROPERTY');
      if (FORBIDDEN_ROW_KEYS.has(key)) throw new Error('UNSUPPORTED_ROW_PROPERTY');
    }
  }
}

const manualRow = z.object({
  sourceKey: z.string().trim().min(1).max(200), date: z.string(),
  kind: z.enum(['verified-duration', 'W', 'CR', 'A']),
  minutes: z.number().int().min(0).max(1440).optional(),
  reference: z.string().trim().min(1).max(500), reason: z.string().trim().min(1).max(1000),
}).strict();
/** Parse the entire batch before returning any entries. Actor/verifier is server-owned. */
export function importDatedAdminEvidence(actor: Actor, scope: Scope, input: unknown): Evidence[] {
  authorize(actor, scope, true);
  assertPlainImportRows(input);
  const rows = z.array(manualRow).min(1).max(1000).parse(input);
  const evidence = rows.map(row => ({ ...row, verifiedBy: actor.userId }));
  for (const row of evidence) validateEvidence(row);
  summarize([...new Set(evidence.map(row => row.date))], evidence);
  return evidence;
}

const mappingSchema = scopeSchema.extend({
  providerLearnerId: z.string().min(1).max(200), courseId: z.string().min(1).max(200),
}).strict();
export type SourceMapping = z.infer<typeof mappingSchema>;
function resolveMapping(scope: Scope, learnerId: string, courseId: string, mappings: SourceMapping[]): void {
  scopeSchema.parse(scope);
  const matches = z.array(mappingSchema).max(10000).parse(mappings).filter(row =>
    row.organizationId === scope.organizationId && row.memberId === scope.memberId &&
    row.enrollmentId === scope.enrollmentId && row.providerLearnerId === learnerId && row.courseId === courseId);
  if (matches.length !== 1) throw new Error('ATTENDANCE_IDENTITY_AMBIGUOUS_OR_UNMAPPED');
}
/** Cumulative estimated CSV/B4B hours have no defensible per-day allocation. */
export function adaptCumulativeSource(scope: Scope, input: unknown, mappings: SourceMapping[]) {
  const row = z.object({ providerLearnerId: z.string().min(1), courseId: z.string().min(1),
    estimatedHours: z.number().finite().nonnegative() }).strict().parse(input);
  resolveMapping(scope, row.providerLearnerId, row.courseId, mappings);
  return { evidence: [] as Evidence[], diagnostic: 'CUMULATIVE_ESTIMATE_NOT_DAILY_ATTENDANCE' as const,
    cumulativeEstimatedHours: row.estimatedHours };
}
/** Parsed xAPI point events establish neither duration nor confirmed absence. */
export function adaptPointEvent(scope: Scope, input: unknown, mappings: SourceMapping[]) {
  const row = z.object({ providerLearnerId: z.string().min(1), courseId: z.string().min(1),
    statementId: z.string().min(1).max(200), timestamp: z.string().datetime({ offset: true }) }).strict().parse(input);
  resolveMapping(scope, row.providerLearnerId, row.courseId, mappings);
  return { evidence: [] as Evidence[], diagnostic: 'POINT_EVENT_HAS_NO_VERIFIED_DURATION' as const };
}

export type Draft = { scope: Scope; snapshot: AttendanceSnapshot; evidence: Evidence[]; hash: string };
/** Domain composition only: callers must fetch profile, enrollment and evidence under the same scope. */
export function createDraft(actor: Actor, scope: Scope, input: {
  kind: SheetKind; selectedDate: string; startMonth: number | null;
  profile: AttendanceSnapshot['profile']; enrollment: AttendanceSnapshot['enrollment']; evidence: Evidence[];
}): Draft {
  authorize(actor, scope);
  const dates = periodDates(input.kind, input.selectedDate, input.startMonth);
  if (input.evidence.some(row => !dates.includes(row.date))) throw new Error('EVIDENCE_OUTSIDE_PERIOD');
  const snapshot: AttendanceSnapshot = { schemaVersion: 1, kind: input.kind,
    provenance: { evidenceDigest: digest(input.evidence), evidenceRevision: digest(input.evidence), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: DRAFT_RULE.pMinimumMinutes, ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    academicLabel: `${dates[0]} to ${dates.at(-1)}`, profile: input.profile, enrollment: input.enrollment,
    days: summarize(dates, input.evidence) };
  const detached = JSON.parse(JSON.stringify({ scope, snapshot, evidence: input.evidence })) as Omit<Draft, 'hash'>;
  return { ...detached, hash: digest(detached) };
}
export async function renderAuthorizedDraft(actor: Actor, draft: Draft): Promise<Uint8Array> {
  authorize(actor, draft.scope);
  if (digest({ scope: draft.scope, snapshot: draft.snapshot, evidence: draft.evidence }) !== draft.hash) throw new Error('STALE_SNAPSHOT');
  return renderAttendancePdf(draft.snapshot);
}

export type SigningState = {
  scope: Scope; hash: string; revision: number; status: 'draft' | 'student-attested' | 'instructor-signed' | 'superseded';
  studentId: string | null; instructorId: string | null;
  satisfactoryProgress: boolean | null;
  completesOnTime: boolean | null;
};
/** Immutable record of one validated transition, retaining both instructor decisions verbatim. */
export type SigningTransitionEvent = {
  action: 'student-attest' | 'instructor-sign' | 'supersede';
  actorId: string;
  hash: string;
  fromRevision: number;
  toRevision: number;
  fromStatus: SigningState['status'];
  toStatus: SigningState['status'];
  satisfactoryProgress: boolean | null;
  completesOnTime: boolean | null;
};
/** Pure validation: returns next state plus the event a future repository would append. Performs no signing. */
export function planSigningTransitionEvent(state: SigningState, actor: Actor, input: unknown, configuredInstructorId: string | null): { next: SigningState; event: SigningTransitionEvent } {
  const next = planSigningTransition(state, actor, input, configuredInstructorId);
  const action = (input as { action: SigningTransitionEvent['action'] }).action;
  return { next, event: {
    action, actorId: actor.userId, hash: state.hash,
    fromRevision: state.revision, toRevision: next.revision,
    fromStatus: state.status, toStatus: next.status,
    satisfactoryProgress: next.satisfactoryProgress, completesOnTime: next.completesOnTime,
  } };
}
export function planSigningTransition(state: SigningState, actor: Actor, input: unknown, configuredInstructorId: string | null): SigningState {
  const command = z.object({ method: z.literal('POST'), action: z.enum(['student-attest', 'instructor-sign', 'supersede']),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/), expectedRevision: z.number().int().nonnegative(),
    consent: z.literal(true), satisfactoryProgress: z.boolean().optional(), completesOnTime: z.boolean().optional(),
  }).strict().parse(input);
  scopeSchema.parse(state.scope);
  id.parse(actor.userId);
  if (actor.organizationId !== state.scope.organizationId) throw new Error('ATTENDANCE_FORBIDDEN');
  if (command.action !== 'instructor-sign' && (command.satisfactoryProgress !== undefined || command.completesOnTime !== undefined)) throw new Error('INSTRUCTOR_DECISIONS_ONLY_ON_INSTRUCTOR_SIGN');
  if (command.expectedHash !== state.hash || command.expectedRevision !== state.revision) throw new Error('STALE_SNAPSHOT');
  if (command.action === 'supersede') {
    authorize(actor, state.scope, true);
    if (state.status !== 'instructor-signed') throw new Error('INVALID_TRANSITION');
    return { ...state, status: 'superseded', revision: state.revision + 1 };
  }
  if (command.action === 'student-attest') {
    if (actor.userId !== state.scope.memberId) throw new Error('STUDENT_ACT_REQUIRED');
    if (state.status !== 'draft') throw new Error('INVALID_TRANSITION');
    return { ...state, studentId: actor.userId, status: 'student-attested', revision: state.revision + 1, satisfactoryProgress: null, completesOnTime: null };
  }
  if (!configuredInstructorId || !id.safeParse(configuredInstructorId).success ||
    actor.userId !== configuredInstructorId || !actor.permissions.includes('attendance:instructor') ||
    actor.userId === state.scope.memberId) throw new Error('CONFIGURED_INSTRUCTOR_REQUIRED');
  if (state.status !== 'student-attested' || state.studentId !== state.scope.memberId) throw new Error('STUDENT_ACT_REQUIRED');
  if (command.satisfactoryProgress === undefined || command.completesOnTime === undefined) throw new Error('INSTRUCTOR_DECISIONS_REQUIRED');
  return {
    ...state,
    instructorId: actor.userId,
    status: 'instructor-signed',
    revision: state.revision + 1,
    satisfactoryProgress: command.satisfactoryProgress,
    completesOnTime: command.completesOnTime,
  };
}

function archiveUnavailable(): never { throw new Error('ATTENDANCE_VERIFIED_ARCHIVE_UNAVAILABLE'); }
export const attendanceProtectedOperations = Object.freeze({
  finalize: archiveUnavailable, studentAttest: archiveUnavailable,
  requestSignature: archiveUnavailable, sign: archiveUnavailable, downloadArchive: archiveUnavailable,
});
export const disabledInvitationAdapter = Object.freeze({
  send(): { sent: false; reason: 'ATTENDANCE_SEND_DISABLED' } {
    return { sent: false, reason: 'ATTENDANCE_SEND_DISABLED' };
  },
});
