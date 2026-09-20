import type { Prisma, TrainingAccessStatus } from '@prisma/client';
import { getPipelineStage } from '@/lib/pipeline/stage';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';

export const MEMBER_EXPORT_LIMIT = 10_000;
const MEMBER_EXPORT_PAGE_SIZE = 1_000;

type MemberExportFilters = {
  state?: string;
  program?: string;
  wioaStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  courseraStatus?: string;
};

const memberExportSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  enrolledProgram: true,
  enrolledAt: true,
  assessmentCompleted: true,
  memberProgramProgress: {
    select: { programSlug: true, averagePercent: true, coursesCompleted: true },
  },
  courseProgress: {
    where: { status: 'COMPLETED' },
    select: { programSlug: true, courseSlug: true },
  },
  assessmentScorePct: true,
  pipelineBoardStage: true,
  wioaQualificationJson: true,
  wioaReviewStatus: true,
  deletedAt: true,
  createdAt: true,
  profile: {
    select: {
      state: true,
      city: true,
      zip: true,
      educationLevel: true,
      employmentStatus: true,
      veteranStatus: true,
      householdIncome: true,
      dob: true,
      ethnicity: true,
    },
  },
  placementRecord: {
    select: {
      employerName: true,
      jobTitle: true,
      salaryOffered: true,
      placedAt: true,
    },
  },
  userCertifications: {
    select: { certName: true, earnedAt: true },
  },
  applications: {
    select: { status: true, submittedAt: true },
  },
  // Multi-program: export resolves the primary enrollment for the funding /
  // programSlug column, with an equivalent legacy-row fallback when older
  // data has no primary marker. Secondary enrollments are not exported.
  courseEnrollments: {
    orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
    select: {
      programSlug: true,
      curriculumVersion: true,
      isPrimary: true,
      fundingSource: true,
      fundingNotes: true,
      enrolledAt: true,
    },
  },
  trainingAccessRequests: {
    select: { providerKey: true, status: true, activatedAt: true },
  },
  applyEligibilityScreenings: {
    take: 1,
    orderBy: { createdAt: 'desc' },
    select: {
      q1: true,
      q2: true,
      q3: true,
      qualifies: true,
      yesCount: true,
      receivingUnemployment: true,
      exhaustedUnemployment: true,
      layoffCompany: true,
      snapWic: true,
      publicAssistancePrograms: true,
      publicAssistanceHelpRequested: true,
      hearAbout: true,
      hearAboutOther: true,
      partnerAmbassadorReferral: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type MemberExportUser = Prisma.UserGetPayload<{ select: typeof memberExportSelect }>;

export function buildMemberExportWhere(filters: MemberExportFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    AND: [MEMBER_ONLY_WHERE],
  };

  if (filters.program) where.enrolledProgram = filters.program;
  if (filters.wioaStatus) where.wioaReviewStatus = filters.wioaStatus;
  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  const andFilters: Prisma.UserWhereInput[] = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];
  if (filters.state) andFilters.push({ profile: { state: filters.state } });
  if (filters.courseraStatus) {
    andFilters.push(
      filters.courseraStatus === 'NONE'
        ? { trainingAccessRequests: { none: { providerKey: 'coursera' } } }
        : {
            trainingAccessRequests: {
              some: { providerKey: 'coursera', status: filters.courseraStatus as TrainingAccessStatus },
            },
          },
    );
  }
  where.AND = andFilters;

  return where;
}

export async function fetchMembersForExport(
  db: Pick<Prisma.TransactionClient, 'user'>,
  where: Prisma.UserWhereInput,
  filterStage?: string,
  limit = MEMBER_EXPORT_LIMIT,
  pageSize = MEMBER_EXPORT_PAGE_SIZE,
): Promise<{ rows: MemberExportUser[]; truncated: boolean }> {
  const rows: MemberExportUser[] = [];
  let cursor: { id: string } | undefined;

  while (rows.length <= limit) {
    const users = await db.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: memberExportSelect,
    });

    if (users.length === 0) break;
    cursor = { id: users[users.length - 1].id };

    for (const u of users) {
      const assignment = resolveTrainingProgressAssignment(
        u.enrolledProgram,
        u.courseEnrollments,
      );
      const stage = getPipelineStage({
        ...u,
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
      });
      if (filterStage && stage !== filterStage) continue;

      rows.push(u);
      if (rows.length > limit) break;
    }

    if (users.length < pageSize) break;
  }

  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
  };
}
