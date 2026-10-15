import type { Prisma } from '@prisma/client';
import { programSlugReadCandidates } from '@/lib/content/programSlug';

/** Program and dates must match the same enrollment, including secondary programs. */
export function memberEnrollmentFilterWhere(args: {
  program?: string;
  startDate?: string;
  endDate?: string;
}): Prisma.UserWhereInput {
  const program = args.program?.trim();
  const enrolledAt: { gte?: Date; lte?: Date } = {};
  if (args.startDate) {
    const date = new Date(args.startDate);
    if (!Number.isNaN(date.getTime())) enrolledAt.gte = date;
  }
  if (args.endDate) {
    const date = new Date(args.endDate);
    if (!Number.isNaN(date.getTime())) {
      date.setUTCHours(23, 59, 59, 999);
      enrolledAt.lte = date;
    }
  }
  const hasDates = Boolean(enrolledAt.gte || enrolledAt.lte);
  if (!program && !hasDates) return {};
  const filters = {
    ...(program ? { programSlug: { in: programSlugReadCandidates(program) } } : {}),
    ...(hasDates ? { enrolledAt } : {}),
  };
  return {
    OR: [
      { courseEnrollments: { some: filters } },
      // The leftover User pointer is only the assignment source before
      // durable enrollments exist; never match a stale prior program/date.
      {
        courseEnrollments: { none: {} },
        ...(program ? { enrolledProgram: { in: programSlugReadCandidates(program) } } : {}),
        ...(hasDates ? { enrolledAt } : {}),
      },
    ],
  };
}
