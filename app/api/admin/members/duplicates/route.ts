import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async (_req: NextRequest) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await requireAdmin(user.id); } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const superAdmin = await isSuperAdmin(user.id);
  const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

  // Raw query: group by lower(email) having count > 1
  const rows = await prisma.$transaction((tx) => tx.$queryRaw<Array<{ email: string; ids: string[] }>>`
    SELECT lower(email) AS email,
           array_agg(id ORDER BY created_at DESC) AS ids
    FROM users
    WHERE deleted_at IS NULL
      ${orgId ? Prisma.sql`AND organization_id = ${orgId}` : Prisma.sql``}
    GROUP BY lower(email)
    HAVING count(*) > 1
  `);

  // Single findMany over all duplicate IDs, then group by lower(email) in JS.
  // This collapses the previous N+1 (one query per duplicate group) into one query.
  const allIds = rows.flatMap((r) => r.ids);
  const allMembers = allIds.length
    ? await prisma.$transaction((tx) => tx.user.findMany({
        where: { id: { in: allIds }, ...(orgId ? { organizationId: orgId } : {}) },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          enrolledProgram: true,
          assessmentCompleted: true,
          memberProgramProgress: {
            select: { programSlug: true, coursesCompleted: true, averagePercent: true },
          },
          courseProgress: {
            where: { status: 'COMPLETED' },
            select: { programSlug: true, courseSlug: true },
          },
          profile: {
            select: {
              address: true,
              city: true,
              state: true,
              zip: true,
              profilePhone: true,
              profileLinkedin: true,
            },
          },
          _count: {
            select: {
              applications: true,
              learningProgress: true,
              userCertifications: true,
              memberEvents: true,
              weeklyRecaps: true,
              counselorAssignments: true,
              aiToolResults: true,
              goals: true,
              jobApplications: true,
              messagesAuthored: true,
              partnerReferrals: true,
            },
          },
        },
        take: 100,
      }))
    : [];

  // Bucket members by lowercased email. The findMany above already returns
  // them in createdAt desc order, so per-bucket order is preserved.
  const membersByEmail = new Map<string, typeof allMembers>();
  for (const member of allMembers) {
    const key = member.email.toLowerCase();
    const bucket = membersByEmail.get(key);
    if (bucket) {
      bucket.push(member);
    } else {
      membersByEmail.set(key, [member]);
    }
  }

  // Walk rows in their original order to preserve group ordering.
  const groups = rows.map((row) => {
    const members = membersByEmail.get(row.email) ?? [];
    return {
      canonicalEmail: row.email,
      members: members.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  });

  return NextResponse.json({ groups, totalGroups: groups.length, totalDuplicates: groups.reduce((s, g) => s + g.members.length, 0) });

  } catch (error) {
    console.error('/admin/members/duplicates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
