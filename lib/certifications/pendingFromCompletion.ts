import { Prisma, type CertStatus, type PrismaClient } from '@prisma/client';

import { auditLog } from '@/lib/audit';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { PROGRAMS, getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { catalogCourseDisplayName } from '@/lib/coursera/courseDisplayName';
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
 *    course, Coursera course id and the write path that reported it. Legacy
 *    name transitions also bind a reused natural-key row to that identity.
 *
 * The certificate name comes from catalog slugs or an exact provider ID
 * inside the attributed program. When a legacy label changes, its original
 * member/program/course audit binds the existing row across write paths;
 * label correction itself remains a separate reviewed repair. Course names repeat
 * across programs ("Lab, Project, and Test Preparation" is in seven canonical
 * programs; "Data Analysis with Python" in two discovered ones), and the
 * unique key is (user, name): a member in two programs would otherwise finish
 * the second "same-named" course and get nothing. A name either catalog
 * carries in more than one program is therefore qualified with the program's
 * display title; a name unique to one program stays as it is (see
 * `resolveCertificationNameForCourse`). The name never depends on what the
 * caller knew about the course for catalog slugs. Legacy identities are
 * serialized and provenance-bound when provider-ID availability differs.
 *
 * The client is injectable: the shared progress writer hands over the
 * transaction it is running in, so a rolled-back completion never leaves an
 * orphan certificate, and the backfill script passes its own client. No
 * `server-only` import on purpose for that script.
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

/**
 * The slice of a Prisma client the helper needs. Either the root client
 * (`$transaction` present: the helper opens its own) or a transaction client
 * the caller is already inside (`$transaction` absent: the helper runs on it,
 * so the certificate commits or rolls back with the caller's write).
 */
export type PendingCertificationDb = Pick<Prisma.TransactionClient, 'userCertification' | 'user' | 'auditLog' | '$executeRaw'> & {
  $transaction?: PrismaClient['$transaction'];
};

function programTitleForSlug(programSlug: string): string {
  const canonical = canonicalizeProgramSlug(programSlug);
  return getProgramDisplayTitle(getProgramBySlug(canonical) ?? canonical);
}

/**
 * Trimmed course name -> display titles of the programs that carry a course
 * with that name, from both catalogs (`PROGRAMS` and the discovered Coursera
 * catalog, which has more courses for some programs). Keyed by display title
 * rather than slug: the discovered catalog lists one program under two slugs
 * (`comptia-network-professional-certificate` and `...-network-plus-...`,
 * same title), and that is one program, not a collision. Built once; a name
 * in more than one program needs qualifying (see module comment), and the
 * qualifier is that same title, so qualified names are distinct by
 * construction.
 */
let programsByCourseName: Map<string, Set<string>> | null = null;

function programsCarryingCourseName(name: string): ReadonlySet<string> {
  if (!programsByCourseName) {
    const index = new Map<string, Set<string>>();
    const add = (programSlug: string, courseName: string) => {
      const key = courseName.trim();
      if (!key) return;
      const set = index.get(key) ?? new Set<string>();
      set.add(programTitleForSlug(programSlug));
      index.set(key, set);
    };
    for (const program of PROGRAMS) {
      for (const course of program.courses) add(program.slug, course.name);
    }
    for (const [programSlug, discovered] of Object.entries(DISCOVERED_COURSERA_PROGRAMS)) {
      for (const course of discovered.courses) add(programSlug, course.name);
    }
    programsByCourseName = index;
  }
  return programsByCourseName.get(name) ?? new Set<string>();
}

/**
 * A course neither catalog knows (a DB-only canonical mapping, say) still
 * gets a readable name. Keep a synthetic course ordinal so a single course
 * cannot masquerade as the whole program's certificate.
 */
export function humaniseCourseSlug(slug: string): string {
  const words = slug
    .trim()
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : slug.trim();
}

/**
 * Stable catalog-backed certificate name: known slug, then exact provider
 * ID in the same program, then the complete slug humanised. Free-form
 * provider display text is never an input. When either catalog carries that name in more
 * than one program the program's display title is appended
 * (`"Lab, Project, and Test Preparation — IT Support Professional Certificate (IBM)"`)
 * so a member in two programs gets one certificate per course, not one per
 * name.
 */
export function resolveCertificationNameForCourse(input: {
  programSlug: string;
  courseSlug: string;
  courseraCourseId?: string | null;
}): string {
  const canonicalProgramSlug = canonicalizeProgramSlug(input.programSlug);
  const baseName =
    catalogCourseDisplayName({ ...input, programSlug: canonicalProgramSlug })
    ?? humaniseCourseSlug(input.courseSlug);
  if (programsCarryingCourseName(baseName).size > 1) {
    return `${baseName} — ${programTitleForSlug(canonicalProgramSlug)}`;
  }
  return baseName;
}

/** Previous fallback, used only to detect a label transition, never to issue a row. */
function previousCertificationName(input: EnsurePendingCertificationInput): string {
  const programSlug = canonicalizeProgramSlug(input.programSlug);
  const baseName = catalogCourseDisplayName({ programSlug, courseSlug: input.courseSlug })
    ?? humaniseCourseSlug(input.courseSlug.replace(/-course-\d+$/i, ''));
  return programsCarryingCourseName(baseName).size > 1
    ? `${baseName} — ${programTitleForSlug(programSlug)}`
    : baseName;
}

async function certificateBeforeLabelCorrection(
  input: EnsurePendingCertificationInput,
  db: PendingCertificationDb,
  previousName: string,
): Promise<EnsurePendingCertificationResult | null> {
  const provenance = await db.auditLog.findMany({
    where: {
      action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
      targetType: 'user_certification',
      targetId: { not: null },
      AND: [
        { metadata: { path: ['userId'], equals: input.userId } },
        { metadata: { path: ['programSlug'], equals: canonicalizeProgramSlug(input.programSlug) } },
        { metadata: { path: ['courseSlug'], equals: input.courseSlug } },
      ],
    },
    distinct: ['targetId'],
    take: 2,
    select: { targetId: true },
  });
  if (provenance.length > 1) throw new Error('Ambiguous certificate provenance for course label correction');
  const targetId = provenance[0]?.targetId;
  if (targetId) {
    const existing = await db.userCertification.findUnique({
      where: { id: targetId, userId: input.userId },
      select: { id: true, certName: true, status: true },
    });
    if (existing) return { created: false, ...existing };
  }

  // Historical audit writes were best-effort. An old label alone cannot
  // prove which course a row represents; require reviewed repair instead of
  // guessing or creating a second row alongside it.
  const unattributed = await db.userCertification.findUnique({
    where: { userId_certName: { userId: input.userId, certName: previousName } },
    select: { id: true },
  });
  if (unattributed) throw new Error('Legacy certificate label requires exact course provenance before correction');
  return null;
}

export async function ensurePendingCertificationForCompletion(
  input: EnsurePendingCertificationInput,
  deps: { db?: PendingCertificationDb } = {},
): Promise<EnsurePendingCertificationResult> {
  const db = deps.db ?? prisma;
  const certName = resolveCertificationNameForCourse(input);
  const previousName = previousCertificationName(input);
  const needsCourseIdentity = certName !== previousName
    || !catalogCourseDisplayName({ programSlug: input.programSlug, courseSlug: input.courseSlug });
  if (needsCourseIdentity) {
    const existing = await certificateBeforeLabelCorrection(input, db, previousName);
    if (existing) return existing;

    const createWithCourseIdentity = async (tx: PendingCertificationDb) => {
      const lockKey = `completion-certificate:${input.userId}:${canonicalizeProgramSlug(input.programSlug)}:${input.courseSlug}`;
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `);
      // Re-read after acquiring the lock. A report without a provider ID
      // can propose another display label for this very same course.
      const retained = await certificateBeforeLabelCorrection(input, tx, previousName);
      if (retained) return retained;
      return createPendingCertificate(input, tx, certName, true);
    };
    return db.$transaction
      ? db.$transaction((tx) => createWithCourseIdentity(tx))
      : createWithCourseIdentity(db);
  }
  return createPendingCertificate(input, db, certName, false);
}

async function createPendingCertificate(
  input: EnsurePendingCertificationInput,
  db: PendingCertificationDb,
  certName: string,
  requireIdentityAudit: boolean,
): Promise<EnsurePendingCertificationResult> {
  const now = new Date();
  const earnedAt =
    input.completedAt && Number.isFinite(input.completedAt.getTime()) ? input.completedAt : now;

  // INSERT ... ON CONFLICT DO NOTHING, then read the row. An existing
  // certificate (the member's own, staff-decided, or a concurrent report's)
  // is skipped without an error: this often runs inside a writer's
  // transaction, where a unique violation would abort the whole transaction
  // and roll back the completion it was reporting. `count` says whether the
  // row is ours.
  const upsertPending = async (client: Pick<Prisma.TransactionClient, 'userCertification'>) => {
    const { count } = await client.userCertification.createMany({
      data: [{
        userId: input.userId,
        certName,
        earnedAt,
        status: 'pending',
        submittedAt: now,
      }],
      skipDuplicates: true,
    });
    const row = await client.userCertification.findUnique({
      where: { userId_certName: { userId: input.userId, certName } },
      select: { id: true, status: true },
    });
    return { created: count === 1, id: row?.id ?? null, status: row?.status ?? null };
  };

  // Root client: our own transaction. Transaction client handed in by a
  // writer: run inside it, so the certificate lives and dies with that write.
  const outcome = db.$transaction
    ? await db.$transaction((tx) => upsertPending(tx))
    : await upsertPending(db);

  if (outcome.created || requireIdentityAudit) {
    // Provenance lives in the audit trail (no source column on the model).
    // A label transition needs atomic provenance: otherwise another report
    // could issue a second label after a missing audit. Catalog-only writes
    // retain their existing best-effort audit behavior.
    const writeAudit = auditLog(
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
          programSlug: canonicalizeProgramSlug(input.programSlug),
          courseSlug: input.courseSlug,
          courseraCourseId: input.courseraCourseId ?? null,
          completedAt: earnedAt.toISOString(),
          source: input.source,
          ...(requireIdentityAudit ? { certificateCreated: outcome.created } : {}),
        },
      },
      db,
    );
    if (requireIdentityAudit) await writeAudit;
    else await writeAudit.catch((error) => {
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
  deps: { db?: PendingCertificationDb } = {},
): Promise<EnsurePendingCertificationResult | null> {
  try {
    return await ensurePendingCertificationForCompletion(input, deps);
  } catch (error) {
    console.error(
      `[certifications] pending certificate from completion failed for user=${input.userId} course=${input.programSlug}/${input.courseSlug}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
