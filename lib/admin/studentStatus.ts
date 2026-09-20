import { prisma } from '@/lib/db/prisma';
import type { User, CourseProgress, UserCertification, MemberEvent } from '@prisma/client';

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
 */
export function buildStatusWhere(status: StudentStatus): Record<string, unknown> {
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
              some: { createdAt: { gte: thirtyDaysAgo } },
            },
          },
          {
            courseProgress: {
              some: {
                status: { in: ['IN_PROGRESS', 'COMPLETED'] },
                updatedAt: { gte: thirtyDaysAgo },
              },
            },
          },
        ],
      };

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
      // Currently flagged by the nightly stale-training check. The stamp is
      // re-written every run while the member stays stale, so an "older than
      // 7 days" bound on it was always false and this filter opened empty
      // under a tile counting flagged members (number audit 2026-09-20, S6).
      return {
        deletedAt: null,
        staleTrainingDetectedAt: { not: null },
      };
    }

    default:
      return {};
  }
}
