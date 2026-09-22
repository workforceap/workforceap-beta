import type { CertStatus, Prisma, PrismaClient } from '@prisma/client';

import { auditLog } from '@/lib/audit';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { PROGRAMS, getDiscoveredProgram, getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
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
 * lands on the same `certName` for the same course. Course names repeat
 * across programs ("Lab, Project, and Test Preparation" is in seven canonical
 * programs; "Data Analysis with Python" in two discovered ones), and the
 * unique key is (user, name): a member in two programs would otherwise finish
 * the second "same-named" course and get nothing. A name either catalog
 * carries in more than one program is therefore qualified with the program's
 * display title; a name unique to one program stays as it is (see
 * `resolveCertificationNameForCourse`). The name never depends on what the
 * caller knew about the course, so every path spells it identically.
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
export type PendingCertificationDb = Pick<Prisma.TransactionClient, 'userCertification' | 'user' | 'auditLog'> & {
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

function catalogCourseName(canonicalProgramSlug: string, courseSlug: string): string | null {
  const fromCatalog = getProgramBySlug(canonicalProgramSlug)?.courses.find((course) => course.slug === courseSlug)?.name;
  if (fromCatalog?.trim()) return fromCatalog.trim();
  const fromDiscovered = getDiscoveredProgram(canonicalProgramSlug)?.courses.find((course) => course.slug === courseSlug)?.name;
  return fromDiscovered?.trim() || null;
}

/**
 * A course neither catalog knows (a DB-only canonical mapping, say) still
 * gets a readable name rather than its raw slug: words from the slug,
 * capitalised, with a trailing catalog-style "course-NN" ordinal dropped.
 */
export function humaniseCourseSlug(slug: string): string {
  const words = slug
    .trim()
    .replace(/-course-\d+$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : slug.trim();
}

/**
 * Stable certificate name for a completed course: canonical catalog name,
 * then the discovered Coursera catalog, then the slug humanised. It is a
 * pure function of (program, course) on purpose: a provider display name is
 * deliberately not an input, so the live hooks and the backfill cannot spell
 * the same course two ways. When either catalog carries that name in more
 * than one program the program's display title is appended
 * (`"Lab, Project, and Test Preparation — IT Support Professional Certificate (IBM)"`)
 * so a member in two programs gets one certificate per course, not one per
 * name.
 */
export function resolveCertificationNameForCourse(input: {
  programSlug: string;
  courseSlug: string;
}): string {
  const canonicalProgramSlug = canonicalizeProgramSlug(input.programSlug);
  const baseName =
    catalogCourseName(canonicalProgramSlug, input.courseSlug)
    ?? humaniseCourseSlug(input.courseSlug);
  if (programsCarryingCourseName(baseName).size > 1) {
    return `${baseName} — ${programTitleForSlug(canonicalProgramSlug)}`;
  }
  return baseName;
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
