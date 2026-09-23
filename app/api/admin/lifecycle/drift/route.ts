import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { programSlugsEquivalent } from '@/lib/content/programSlug';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * - enrolled_no_record: legacy pointer set, no primary CourseEnrollment row.
 * - pointer_missing: primary row exists, legacy pointer is NULL.
 * - slug_mismatch: pointer and primary row name different programs.
 * - alias_equivalent: different stored slugs that canonicalize to the same
 *   program (lib/content/programSlug.ts). The app already treats them as one
 *   program, so this is not a slug_mismatch, but it stays listed because the
 *   alias table itself is under content-owner review.
 */
type DriftType = 'enrolled_no_record' | 'pointer_missing' | 'slug_mismatch' | 'alias_equivalent';

type DriftRecord = {
  userId: string;
  fullName: string | null;
  email: string;
  driftType: DriftType;
  userProgram: string | null;
  enrollmentProgram: string | null;
};

function emptyCounts(): Record<DriftType, number> {
  return { enrolled_no_record: 0, pointer_missing: 0, slug_mismatch: 0, alias_equivalent: 0 };
}

function driftResponse(records: DriftRecord[], scanned: number) {
  const counts = emptyCounts();
  for (const record of records) counts[record.driftType] += 1;
  return NextResponse.json({
    total: records.length,
    counts,
    records: records.slice(0, 100),
    scanned,
    checkedAt: new Date().toISOString(),
  });
}

export const GET = withApiGuc(async () => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Tenant scope: super-admins see drift across the platform; tenant admins
  // only see members in their own organization. Without this filter a non-
  // super tenant admin would see member emails + program slugs across every
  // tenant on the platform.
  let orgFilterId: string | null = null;
  if (!(await isSuperAdmin(user.id))) {
    try {
      orgFilterId = await getActorOrganizationId(user.id);
    } catch {
      return driftResponse([], 0);
    }
  }

  // Find users with the legacy enrolledProgram pointer OR a primary
  // CourseEnrollment row, so a primary-row member with a NULL pointer is
  // scanned too. Drift compares User.enrolledProgram against the user's
  // *primary* CourseEnrollment row (isPrimary = true). Secondary enrollments
  // are not a drift signal — a user can legitimately be enrolled in IT
  // Support (primary) + Cybersecurity (secondary). Prisma findMany with a
  // filtered relation returns at most one row because of the partial unique
  // index. Read-only: nothing here backfills the pointer.
  const enrolledUsers = await prisma.$transaction((tx) => tx.user.findMany({
    where: {
      OR: [
        { enrolledProgram: { not: null } },
        { courseEnrollments: { some: { isPrimary: true } } },
      ],
      deletedAt: null,
      ...(orgFilterId ? { organizationId: orgFilterId } : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      enrolledAt: true,
      courseEnrollments: {
        where: { isPrimary: true },
        select: { programSlug: true, enrolledAt: true },
        take: 1,
      },
    },
    take: 500,
  }));

  const driftRecords: DriftRecord[] = [];

  for (const u of enrolledUsers) {
    const primary = u.courseEnrollments[0] ?? null;
    let driftType: DriftType | null = null;
    if (!primary) {
      if (u.enrolledProgram) driftType = 'enrolled_no_record';
    } else if (!u.enrolledProgram) {
      driftType = 'pointer_missing';
    } else if (u.enrolledProgram !== primary.programSlug) {
      driftType = programSlugsEquivalent(u.enrolledProgram, primary.programSlug)
        ? 'alias_equivalent'
        : 'slug_mismatch';
    }
    if (!driftType) continue;
    driftRecords.push({
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      driftType,
      userProgram: u.enrolledProgram,
      enrollmentProgram: primary?.programSlug ?? null,
    });
  }

  return driftResponse(driftRecords, enrolledUsers.length);

  } catch (error) {
    console.error('/admin/lifecycle/drift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

