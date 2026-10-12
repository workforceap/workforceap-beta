import 'server-only';

import { prisma } from '@/lib/db/prisma';

/** Keep the page and read-only audit on the same enrollment and legacy fallback. */
export async function loadMemberEmployerScreeningProgram(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      enrolledProgram: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
        select: { programSlug: true, curriculumVersion: true },
      },
      courseProgress: {
        select: {
          programSlug: true,
          courseSlug: true,
          courseId: true,
          status: true,
          percentComplete: true,
        },
      },
    },
  });
  const activeEnrollment = dbUser?.courseEnrollments[0] ?? null;
  const slug = activeEnrollment?.programSlug ?? dbUser?.enrolledProgram ?? null;
  return { dbUser, activeEnrollment, slug };
}

/** Exact slug and latest active pack, matching the member page's availability gate. */
export async function loadMemberEmployerScreeningPack(programSlug: string) {
  const pack = await prisma.employerScreeningPack.findFirst({
    where: { programSlug, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  const status: 'absent' | 'available' | 'invalid' =
    !pack ? 'absent' : Array.isArray(pack.questionsJson) ? 'available' : 'invalid';
  return { pack, status };
}
