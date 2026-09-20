import type { Prisma } from '@prisma/client';
import { MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';

export type StudentStatus = 'enrolled' | 'active' | 'completed' | 'dropped' | 'stale';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  enrolled: 'Enrolled',
  active: 'Active',
  completed: 'Completed',
  dropped: 'Dropped',
  stale: 'Stale Training',
};

export interface StudentStatusContext {
  enrolledAt: Date | null;
  enrolledProgram: string | null;
  deletedAt: Date | null;
  updatedAt: Date;
  courseProgressCount: number;
  certificationCount: number;
  recentEventCount: number;
}

/**
 * Derive a student's display status from their record and related aggregates.
 *
 * Priority (highest first):
 *   dropped    → soft-deleted (deletedAt != null)
 *   completed  → has certifications OR all courses completed (100% progress)
 *   enrolled   → has enrolledAt (is in a program)
 *   active     → has recent activity (events or updated within 30 days)
 *
 * A student can only have one status; the first matching rule wins.
 */
export function getStudentStatus(ctx: StudentStatusContext): StudentStatus {
  if (ctx.deletedAt) return 'dropped';
  if (ctx.certificationCount > 0 || ctx.courseProgressCount >= 100) return 'completed';
  if (ctx.enrolledAt && ctx.enrolledProgram) return 'enrolled';
  if (ctx.recentEventCount > 0) return 'active';
  // Fallback: if updated recently but no other signals, mark active
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (ctx.updatedAt >= thirtyDaysAgo) return 'active';
  return 'enrolled'; // default for members that exist
}

/**
 * Build a Prisma where-clause modifier for the given status filter.
 *
 * Because status is derived from related tables (course_progress,
 * user_certifications, member_events), we use EXISTS sub-queries via
 * the `some` / `none` relation filters where possible, and fall back to
 * field-level checks for the simpler cases.
 *
 * Typed `Prisma.UserWhereInput` on purpose: the previous
 * `Record<string, unknown>` return let callers cast it into a user query, and
 * hid a `courseProgress.updatedAt` reference that does not exist on the model
 * (the column is `lastUpdatedAt`). The "Active (recent activity)" filter threw
 * PrismaClientValidationError in production because of it — the roster showed
 * AdminDataLoadError and the CSV returned 500 (audit 2026-09-20, S18).
 */
export function buildStatusWhere(status: StudentStatus): Prisma.UserWhereInput {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (status) {
    case 'enrolled':
      return {
        enrolledAt: { not: null },
        enrolledProgram: { not: null },
        deletedAt: null,
      };

    case 'active':
      return {
        deletedAt: null,
        OR: [
          { updatedAt: { gte: thirtyDaysAgo } },
          {
            memberEvents: {
              // Nudge emails and recap digests are sent *to* the member; they
              // are not the member doing something (S1, shared with Health).
              some: { createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
            },
          },
          {
            courseProgress: {
              some: {
                status: { in: ['IN_PROGRESS', 'COMPLETED'] },
                lastUpdatedAt: { gte: thirtyDaysAgo },
              },
            },
          },
        ],
      };

    // NOTE: this matches any member with a certification OR at least one
    // completed course — it is not "certified". The filter is labelled
    // "Completed a course" in the UI to say so (audit 2026-09-20, S19: 3 of
    // the 5 rows it returned held no certification). Narrowing it to
    // certifications only is open with Mike (Needs Mike 7).
    case 'completed':
      return {
        deletedAt: null,
        OR: [
          {
            userCertifications: {
              some: {},
            },
          },
          {
            courseProgress: {
              some: { status: 'COMPLETED' },
            },
          },
        ],
      };

    case 'dropped':
      return {
        deletedAt: { not: null },
      };

    case 'stale': {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        deletedAt: null,
        staleTrainingDetectedAt: { not: null, lte: sevenDaysAgo },
      };
    }

    default:
      return {};
  }
}
