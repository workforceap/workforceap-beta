import type { Evidence } from './evidence';
import type { AttendanceSnapshot } from './pdf';
import type { Actor, Draft, Scope, SourceMapping } from './workflow';

/** Everything here is loaded by the adapter from the trusted store, never from request JSON. */
export type TrustedEnrollment = {
  scope: Scope;
  active: boolean;
  profile: AttendanceSnapshot['profile'];
  enrollment: AttendanceSnapshot['enrollment'];
  /** Enrollment start month used for yearly sheets; null means yearly is unavailable. */
  startMonth: number | null;
  configuredInstructorId: string | null;
  sourceMappings: SourceMapping[];
};

export type EvidenceAppendResult = {
  /** Number of committed batches for this enrollment after the call. */
  revision: number;
  /** True when every submitted row was already current: nothing was appended. */
  duplicate: boolean;
  appended: number;
  superseded: number;
};

export type EvidenceHistoryEntry = { batch: number; evidence: Evidence; supersedes: number | null };

/**
 * Scoped repository boundary. Implementations must resolve an enrollment only when
 * organization, member AND enrollment all match the trusted record.
 */
export interface AttendanceEvidenceRepository {
  getTrustedEnrollment(scope: Scope): TrustedEnrollment | null;
  /** Current (latest-revision-per-sourceKey) evidence. */
  listCurrentEvidence(scope: Scope): Evidence[];
  currentRevision(scope: Scope): number;
  /** Atomic: either the whole batch commits at expectedRevision, or nothing changes. */
  appendEvidence(actor: Actor, scope: Scope, rows: unknown, expectedRevision: number): EvidenceAppendResult;
  history(scope: Scope): EvidenceHistoryEntry[];
  saveDraft(scope: Scope, draft: Draft): { draftId: string };
  loadDraft(scope: Scope, draftId: string): Draft | null;
}
