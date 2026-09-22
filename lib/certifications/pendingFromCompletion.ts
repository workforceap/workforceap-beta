import type { CertStatus, PrismaClient } from '@prisma/client';

import { auditLog } from '@/lib/audit';
import { getDiscoveredProgram, getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { prisma } from '@/lib/db/prisma';

/**
 * Coursera completion -> pending certificate (product review 2026-09-22, item
 * 4; Mike's go 15:57 UTC, Slack ts 1790092663.833649).
 *
 * Until now nothing wrote a `UserCertification` from a course completion, so a
 * member who finished three courses saw "Earned 0 / Verified 0" on My
 * Certificates until they typed each certificate in by hand. This helper is
 * the one place that turns a completion the platform has recorded into a
 * `pending` certificate row, so staff verify it in the existing
 * /admin/certifications queue exactly like a self-report.
 *
 * Semantics:
 *  - Idempotent on the schema's natural key `@@unique([userId, certName])`.
 *    A second completion report for the same course is a no-op.
 *  - Never touches an existing row. A certificate the member typed in, a row
 *    staff already `approved` or `rejected`, or an earlier system row keeps
 *    its status, dates and proof untouched. The helper only ever INSERTs.
 *  - `pending` is the same status the self-report paths use
 *    (app/api/member/certifications/route.ts, dashboard/logCertAction.ts), so
 *    the review route and the approval effects (WAP-20) apply unchanged.
 *  - `UserCertification` has no source column, so provenance goes to the
 *    audit trail: one `audit_logs` row per created certificate, action
 *    `system_certification_pending_from_completion`, with the program,
 *    course, Coursera course id and the write path that reported it.
 *
 * The certificate name is resolved from the canonical catalog first
 * (`lib/content/programs.ts`, then the discovered Coursera catalog) so every
 * write path (webhook, xAPI, B4B cron, per-user sync, CSV import, backfill)
 * lands on the same `certName` for the same course; the caller's display
 * name is only a fallback for courses the catalog does not know.
 *
 * No `server-only` import on purpose: the backfill script under scripts/
 * runs this under tsx.
 */

export const PENDING_CERTIFICATION_FROM_COMPLETION_ACTION = 'system_certification_pending_from_completion';

/** Which write path reported the completion; recorded in the audit row only. */
export type CompletionCertificationSource =
  | 'coursera-webhook'
  | 'coursera-enterprise-sync'
  | 'coursera-progress-merge'
  | 'backfill-script';

export type EnsurePendingCertificationInput = {
  userId: string;
  programSlug: string;
  courseSlug: string;
  /** Provider/display name; used only when the catalog has no entry for the course. */
  courseName?: string | null;
  courseraCourseId?: string | null;
  /** Provider completion time when known; otherwise the row is dated now. */
  completedAt?: Date | null;
  source: CompletionCertificationSource;
};

export type EnsurePendingCertificationResult = {
  /** True when this call inserted the row; false when one already existed. */
  created: boolean;
  certName: string;
  id: string | null;
  status: CertStatus | null;
};

/** The slice of the Prisma client the helper needs; a script may pass its own client. */
export type PendingCertificationDb = Pick<PrismaClient, '$transaction' | 'user' | 'auditLog'>;

function catalogCourseName(programSlug: string, courseSlug: string): string | null {
  const canonical = canonicalizeProgramSlug(programSlug);
  const fromCatalog = getProgramBySlug(canonical)?.courses.find((course) => course.slug === courseSlug)?.name;
  if (fromCatalog?.trim()) return fromCatalog.trim();
  const fromDiscovered = getDiscoveredProgram(canonical)?.courses.find((course) => course.slug === courseSlug)?.name;
  return fromDiscovered?.trim() || null;
}

/**
 * Stable certificate name for a completed course: canonical catalog name,
 * then the discovered Coursera catalog, then the caller's display name, then
 * the course slug. Exported so the backfill script counts against the same
 * names the live paths write.
 */
export function resolveCertificationNameForCourse(input: {
  programSlug: string;
  courseSlug: string;
  courseName?: string | null;
}): string {
  return (
    catalogCourseName(input.programSlug, input.courseSlug)
    ?? (input.courseName?.trim() || input.courseSlug.trim())
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export async function ensurePendingCertificationForCompletion(
  input: EnsurePendingCertificationInput,
  deps: { db?: PendingCertificationDb } = {},
): Promise<EnsurePendingCertificationResult> {
  const db = deps.db ?? prisma;
  const certName = resolveCertificationNameForCourse(input);
  const now = new Date();
  const earnedAt =
    input.completedAt && Number.isFinite(input.completedAt.getTime()) ? input.completedAt : now;

  // Read and insert run in one transaction: the unique key makes the insert
  // the real guard, the read keeps the common repeat case free of P2002
  // noise and tells us whether the row is ours to describe as created.
  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.userCertification.findUnique({
      where: { userId_certName: { userId: input.userId, certName } },
      select: { id: true, status: true },
    });
    if (existing) {
      return { created: false as const, id: existing.id, status: existing.status };
    }
    try {
      const row = await tx.userCertification.create({
        data: {
          userId: input.userId,
          certName,
          earnedAt,
          status: 'pending',
          submittedAt: now,
        },
        select: { id: true, status: true },
      });
      return { created: true as const, id: row.id, status: row.status };
    } catch (error) {
      // Two completion reports for the same course racing on the unique key:
      // the other writer owns the row, and this one changes nothing.
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx.userCertification.findUnique({
        where: { userId_certName: { userId: input.userId, certName } },
        select: { id: true, status: true },
      });
      return { created: false as const, id: raced?.id ?? null, status: raced?.status ?? null };
    }
  });

  if (outcome.created) {
    // Provenance lives in the audit trail (no source column on the model).
    // Best-effort: a failed audit write must not undo or block the
    // certificate the member is waiting to see.
    await auditLog(
      {
        actorUserId: null,
        actorEmailSnapshot: null,
        actorRoleSnapshot: 'system',
        action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
        targetType: 'user_certification',
        targetId: outcome.id,
        metadata: {
          userId: input.userId,
          certName,
          programSlug: input.programSlug,
          courseSlug: input.courseSlug,
          courseraCourseId: input.courseraCourseId ?? null,
          completedAt: earnedAt.toISOString(),
          source: input.source,
        },
      },
      db,
    ).catch((error) => {
      console.error('[certifications] provenance audit for completion certificate failed:', error);
    });
  }

  return { ...outcome, certName };
}

/**
 * Completion writers call this: it logs and swallows, because the durable
 * completion is already written and a certificate that fails to appear is
 * retried by the next completion report or the backfill script.
 */
export async function ensurePendingCertificationForCompletionSafely(
  input: EnsurePendingCertificationInput,
): Promise<EnsurePendingCertificationResult | null> {
  try {
    return await ensurePendingCertificationForCompletion(input);
  } catch (error) {
    console.error(
      `[certifications] pending certificate from completion failed for user=${input.userId} course=${input.programSlug}/${input.courseSlug}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
