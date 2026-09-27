import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';

export type BillableEnrollment = {
  /** Canonical catalog slug (aliases collapsed). */
  programSlug: string;
  curriculumVersion: string | null;
  isPrimary: boolean;
  source: 'course_enrollment' | 'legacy_enrolled_program';
};

/**
 * Programs a member can be invoiced for, inside one organization. Canonical
 * `CourseEnrollment` rows win; the legacy `User.enrolledProgram` pointer is
 * used only when the member has no enrollment rows at all. CourseEnrollment
 * has no status column, so every row (including completed training) counts.
 */
export async function resolveBillableEnrollments(memberId: string, organizationId: string): Promise<BillableEnrollment[]> {
  return withTenantScope(organizationId, async (db) => {
    const rows = await db.courseEnrollment.findMany({
      where: { userId: memberId, organizationId },
      select: { programSlug: true, curriculumVersion: true, isPrimary: true },
      orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'asc' }],
    });
    if (rows.length > 0) {
      const seen = new Set<string>();
      return rows.flatMap((row) => {
        const programSlug = canonicalizeProgramSlug(row.programSlug);
        if (seen.has(programSlug)) return [];
        seen.add(programSlug);
        return [{ programSlug, curriculumVersion: row.curriculumVersion, isPrimary: row.isPrimary, source: 'course_enrollment' as const }];
      });
    }
    const member = await withTenantScope(organizationId, (scoped) =>
      scoped.user.findFirst({ where: { id: memberId, organizationId, deletedAt: null }, select: { enrolledProgram: true } }),
    );
    return member?.enrolledProgram
      ? [{ programSlug: canonicalizeProgramSlug(member.enrolledProgram), curriculumVersion: null, isPrimary: true, source: 'legacy_enrolled_program' as const }]
      : [];
  });
}

/** The billable enrollment matching a requested slug (aliases accepted), or null. */
export async function findBillableEnrollment(memberId: string, organizationId: string, requestedSlug: string): Promise<BillableEnrollment | null> {
  const enrollments = await resolveBillableEnrollments(memberId, organizationId);
  return enrollments.find((e) => programSlugsEquivalent(e.programSlug, requestedSlug)) ?? null;
}
