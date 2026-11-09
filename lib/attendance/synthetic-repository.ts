import { canonical, digest, summarize, type Evidence } from './evidence';
import type { AttendanceEvidenceRepository, EvidenceAppendResult, EvidenceHistoryEntry, TrustedEnrollment } from './repository';
import { importDatedAdminEvidence, type Actor, type Draft, type Scope } from './workflow';
import { syntheticEnrollments } from './synthetic-fixtures';

/**
 * LOCAL SYNTHETIC adapter: in-memory, non-durable, append-only. Not operational
 * persistence. History is never mutated; "current" is the latest revision per sourceKey.
 */
export class InMemorySyntheticAttendanceRepository implements AttendanceEvidenceRepository {
  private readonly enrollments = new Map(syntheticEnrollments().map(row => [row.scope.enrollmentId, row]));
  private readonly log = new Map<string, EvidenceHistoryEntry[]>();
  private readonly batches = new Map<string, number>();
  private readonly drafts = new Map<string, Draft>();

  getTrustedEnrollment(scope: Scope): TrustedEnrollment | null {
    const row = this.enrollments.get(scope.enrollmentId);
    if (!row || row.scope.organizationId !== scope.organizationId || row.scope.memberId !== scope.memberId) return null;
    return structuredClone(row);
  }

  history(scope: Scope): EvidenceHistoryEntry[] {
    if (!this.getTrustedEnrollment(scope)) return [];
    return structuredClone(this.log.get(scope.enrollmentId) ?? []);
  }

  private current(scope: Scope): Map<string, EvidenceHistoryEntry> {
    const latest = new Map<string, EvidenceHistoryEntry>();
    for (const entry of this.log.get(scope.enrollmentId) ?? []) latest.set(entry.evidence.sourceKey, entry);
    return latest;
  }

  listCurrentEvidence(scope: Scope): Evidence[] {
    if (!this.getTrustedEnrollment(scope)) return [];
    return structuredClone([...this.current(scope).values()].map(entry => entry.evidence));
  }

  currentRevision(scope: Scope): number {
    return this.getTrustedEnrollment(scope) ? this.batches.get(scope.enrollmentId) ?? 0 : 0;
  }

  appendEvidence(actor: Actor, scope: Scope, rows: unknown, expectedRevision: number): EvidenceAppendResult {
    const trusted = this.getTrustedEnrollment(scope);
    if (!trusted) throw new Error('ATTENDANCE_ENROLLMENT_NOT_FOUND');
    if (!trusted.active) throw new Error('ATTENDANCE_ENROLLMENT_INACTIVE');
    // Validates permission, tenant scope, strict row shape and per-batch coverage; verifier comes from actor.
    const parsed = importDatedAdminEvidence(actor, scope, rows);
    const revision = this.currentRevision(scope);
    if (expectedRevision !== revision) throw new Error('ATTENDANCE_STALE_REVISION');
    const latest = this.current(scope);
    const additions: EvidenceHistoryEntry[] = [];
    const inBatch = new Map<string, Evidence>();
    let superseded = 0;
    for (const evidence of parsed) {
      const sameKey = inBatch.get(evidence.sourceKey);
      if (sameKey) {
        // The same source twice in one batch must be byte-identical, otherwise the batch is ambiguous.
        if (canonical(sameKey) !== canonical(evidence)) throw new Error('CONFLICTING_EVIDENCE_IDENTITY');
        continue;
      }
      inBatch.set(evidence.sourceKey, evidence);
      const existing = latest.get(evidence.sourceKey);
      if (existing && canonical(existing.evidence) === canonical(evidence)) continue;
      if (existing) superseded++;
      additions.push({ batch: revision + 1, evidence, supersedes: existing?.batch ?? null });
    }
    if (additions.length === 0) return { revision, duplicate: true, appended: 0, superseded: 0 };
    // Dry-run the resulting current set; any ambiguity rejects the whole batch with nothing written.
    const projected = new Map([...latest.entries()].map(([key, entry]) => [key, entry.evidence]));
    for (const entry of additions) projected.set(entry.evidence.sourceKey, entry.evidence);
    const rowsAfter = [...projected.values()];
    summarize([...new Set(rowsAfter.map(row => row.date))], rowsAfter);
    this.log.set(scope.enrollmentId, [...(this.log.get(scope.enrollmentId) ?? []), ...additions]);
    this.batches.set(scope.enrollmentId, revision + 1);
    return { revision: revision + 1, duplicate: false, appended: additions.length, superseded };
  }

  saveDraft(scope: Scope, draft: Draft): { draftId: string } {
    if (!this.getTrustedEnrollment(scope)) throw new Error('ATTENDANCE_ENROLLMENT_NOT_FOUND');
    const draftId = digest({ scope, hash: draft.hash });
    this.drafts.set(`${scope.organizationId}:${scope.memberId}:${scope.enrollmentId}:${draftId}`, structuredClone(draft));
    return { draftId };
  }

  loadDraft(scope: Scope, draftId: string): Draft | null {
    if (!this.getTrustedEnrollment(scope)) return null;
    const draft = this.drafts.get(`${scope.organizationId}:${scope.memberId}:${scope.enrollmentId}:${draftId}`);
    return draft ? structuredClone(draft) : null;
  }
}
