import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { eventNameReadCandidates } from '@/lib/events/names';

const referralMemberSelect = {
  id: true,
  fullName: true,
  enrolledProgram: true,
  enrolledAt: true,
  updatedAt: true,
  deletedAt: true,
  assessmentCompleted: true,
  // Multi-program: load all enrollments so the partner-facing pipeline /
  // referred-members views surface every program a learner is in, not just
  // their primary `User.enrolledProgram` cache. The outer `as const` on this
  // select would coerce a Prisma `orderBy` array to `readonly`, which the
  // generated client rejects — so sort below in JS instead (1-2 rows per
  // learner, no perf concern).
  courseEnrollments: {
    select: {
      programSlug: true,
      curriculumVersion: true,
      isPrimary: true,
      enrolledAt: true,
    },
  },
  placementRecord: {
    select: {
      employerName: true,
      jobTitle: true,
      salaryOffered: true,
      placedAt: true,
      startDateVerified: true,
      onboardingWindowEnd: true,
      retentionDecision: true,
    },
  },
  // WAP-171: privacy policy §3.3 lets a referring partner see enrollment
  // status, progress and outcomes. Ethnicity and veteran status (§1.2
  // eligibility & demographic data) are never loaded for partner surfaces.
  profile: {
    select: {
      city: true,
      state: true,
      zip: true,
      employmentStatus: true,
      educationLevel: true,
    },
  },
  userCertifications: { select: { certName: true, earnedAt: true } },
  applications: { select: { status: true, submittedAt: true } },
  memberProgramProgress: {
    select: { programSlug: true, averagePercent: true, coursesCompleted: true },
  },
} as const;

export type ReferralMember = {
  id: string;
  fullName: string;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
  assessmentCompleted: boolean;
  courseEnrollments: {
    programSlug: string;
    curriculumVersion: string;
    isPrimary: boolean;
    enrolledAt: Date;
  }[];
  placementRecord: {
    employerName: string;
    jobTitle: string;
    salaryOffered: number | null;
    placedAt: Date | null;
    /** Same field the partner payout flow gates on (see lib/partner/payoutEligibility.ts). */
    startDateVerified: boolean;
    onboardingWindowEnd: Date | null;
    retentionDecision: string | null;
  } | null;
  profile: {
    city: string | null;
    state: string | null;
    zip: string | null;
    employmentStatus: string | null;
    educationLevel: string | null;
  } | null;
  userCertifications: { certName: string; earnedAt: Date | null }[];
  applications: { status: string; submittedAt: Date | null }[];
  memberProgramProgress: { programSlug: string; averagePercent: number; coursesCompleted: number }[];
};

export type PipelineRow = {
  member: ReferralMember;
  referredAt: Date;
  stage: string;
  /** Primary-program progress percent (kept for legacy callers). */
  progress: number;
  /** Comma-joined display of every program the learner is enrolled in,
   *  primary first. Falls back to the primary-only label when only one
   *  program exists. */
  programTitle: string;
  /** All program titles the learner is enrolled in, primary first.
   *  Empty when the learner has no `course_enrollments` rows yet. */
  allProgramTitles: string[];
};

/** Pending placement confirmations older than this are not "to review" (outcomes and overview agree). */
export const PENDING_PLACEMENT_WINDOW_DAYS = 90;

export function pendingPlacementWindowStart(now: number = Date.now()): Date {
  return new Date(now - PENDING_PLACEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Most referral rows `loadPartnerReferralBundle` loads (newest first). */
export const PARTNER_REFERRAL_BUNDLE_CAP = 500;

/**
 * The referral scope every partner surface reads: this partner's rows, in its
 * own org, for non-deleted member accounts (staff/test accounts excluded).
 * Shared by the bundle load and `countPartnerReferrals`, so a count and a
 * load can never disagree about which referrals are in scope.
 */
export function partnerReferralScopeWhere(partnerId: string, tenantOrganizationId: string) {
  return {
    partnerId,
    partner: { organizationId: tenantOrganizationId },
    member: {
      deletedAt: null,
      organizationId: tenantOrganizationId,
      ...MEMBER_ONLY_WHERE,
    },
  };
}

/** Uncapped count of the referrals `loadPartnerReferralBundle` would load. */
export async function countPartnerReferrals(partnerId: string, tenantOrganizationId: string): Promise<number> {
  return prisma.partnerReferral.count({
    where: partnerReferralScopeWhere(partnerId, tenantOrganizationId),
  });
}

/**
 * @param tenantOrganizationId — Partner portal tenant boundary: partner row
 *   and referred members must belong to this org (defense against orphaned /
 *   cross-tenant referral rows).
 */
export async function loadPartnerReferralBundle(partnerId: string, tenantOrganizationId: string) {
  const referrals = await prisma.partnerReferral.findMany({
    take: PARTNER_REFERRAL_BUNDLE_CAP,
    where: partnerReferralScopeWhere(partnerId, tenantOrganizationId),
    include: {
      member: { select: referralMemberSelect },
    },
    orderBy: { referredAt: 'desc' },
  });

  const memberIds = referrals.map((r) => r.member.id);

  const ninetyDaysAgo = pendingPlacementWindowStart();

  // Load pending placement confirmations (self-reported by members, not yet reviewed)
  const pendingPlacements =
    memberIds.length === 0
      ? []
      : await prisma.memberEvent.findMany({
        take: 500,
          where: {
            userId: { in: memberIds },
            eventName: { in: eventNameReadCandidates('placement_confirmation_submitted') },
            createdAt: { gte: ninetyDaysAgo },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            userId: true,
            eventName: true,
            metadata: true,
            createdAt: true,
          },
        });

  // Group by userId for quick lookup
  const pendingByUserId = new Map<string, typeof pendingPlacements[number]>();
  for (const p of pendingPlacements) {
    if (!pendingByUserId.has(p.userId)) {
      pendingByUserId.set(p.userId, p);
    }
  }

  const pipelineMembers: PipelineRow[] = [];

  for (const r of referrals) {
    const m = r.member as ReferralMember;
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    const program = assignment.programSlug
      ? getProgramBySlug(assignment.programSlug)
      : null;
    const student: PipelineStudent = {
      id: m.id,
      fullName: m.fullName,
      email: '',
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      enrolledAt: m.enrolledAt,
      assessmentCompleted: m.assessmentCompleted,
      deletedAt: m.deletedAt,
      placementRecord: m.placementRecord as PipelineStudent['placementRecord'],
      userCertifications: m.userCertifications as PipelineStudent['userCertifications'],
      applications: m.applications,
      memberProgramProgress: m.memberProgramProgress,
    };
    const stage = getPipelineStage(student);

    // Multi-program-aware program label: list every enrolled program (primary
    // first), so partners viewing a referred member see all programs the
    // learner is in, not just the one cached on `User.enrolledProgram`.
    // De-dupe in case a slug appears in both `course_enrollments` and
    // `enrolledProgram` after backfill collisions.
    const allProgramTitles = (() => {
      // Sort here (primary first, then earliest-enrolled) since we couldn't
      // express orderBy in the readonly select above.
      const sortedEnrollments = [...(m.courseEnrollments ?? [])].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.enrolledAt.getTime() - b.enrolledAt.getTime();
      });
      const titles: string[] = [];
      const seen = new Set<string>();
      for (const enrollment of sortedEnrollments) {
        if (seen.has(enrollment.programSlug)) continue;
        seen.add(enrollment.programSlug);
        titles.push(programDisplayTitle(enrollment.programSlug));
      }
      // Fallback to legacy enrolledProgram for unmigrated members.
      if (titles.length === 0 && program) titles.push(program.title);
      return titles;
    })();

    pipelineMembers.push({
      member: m,
      referredAt: r.referredAt,
      stage,
      // Progress still reflects the primary program — that's the headline
      // % partners see today. Multi-program partners can read
      // `allProgramTitles.length > 1` to know there's more.
      progress: memberProgramProgressPct({
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        coursesCompleted: null,
        liveProgress: m.memberProgramProgress,
      }),
      programTitle: allProgramTitles.length > 0 ? allProgramTitles.join(' · ') : '—',
      allProgramTitles,
    });
  }

  const members = pipelineMembers.map((p) => p.member);

  return { referrals, members, pipelineMembers, pendingPlacements };
}

/**
 * Partner-facing placement story. Names the employer and job only once staff
 * verified the start date; a self-reported or employer-marked hire is
 * recorded with `startDateVerified: false` and reads as pending, with no
 * employer, job or salary. Same wording as #2562's `partnerPlacementLabel`
 * for the unverified case.
 */
export const PARTNER_PLACEMENT_PENDING_STORY = 'Placement reported, pending verification';

export function partnerPlacementStory(placement: {
  employerName: string;
  jobTitle: string;
  startDateVerified: boolean | null;
}): string {
  return placement.startDateVerified === true
    ? `Placed at ${placement.employerName} as ${placement.jobTitle}`
    : PARTNER_PLACEMENT_PENDING_STORY;
}

export function toPartnerMembersListRows(pipelineMembers: PipelineRow[]) {
  return pipelineMembers.map(
    ({ member: m, referredAt, stage, progress, programTitle, allProgramTitles }) => {
      const stageLabel = PIPELINE_STAGE_LABELS[stage as keyof typeof PIPELINE_STAGE_LABELS] ?? stage;
      // For story copy, prefer the headline (primary) program title — the
      // narrative reads cleaner ("12% through IT Support" not "12% through
      // IT Support · AI Practitioner"). The full list lives on
      // `allProgramTitles` and is rendered separately by callers that want
      // the multi-program chip.
      const headlineTitle = allProgramTitles[0] ?? programTitle;
      const story = m.placementRecord
        ? partnerPlacementStory(m.placementRecord)
        : progress >= 100
          ? `Completed ${headlineTitle}`
          : progress > 0
            ? `${progress}% through ${headlineTitle}`
            : stage === 'enrolled'
              ? `Enrolled in ${headlineTitle}`
              : stageLabel;

      return {
        id: m.id,
        fullName: m.fullName,
        stage,
        stageLabel,
        progress,
        programTitle,
        allProgramTitles,
        story,
        referredAtLabel: referredAt.toLocaleDateString(),
        // Same field the partner payout flow gates on — lets the referred-members
        // list badge a placement as "Verified" vs "Pending verification" instead
        // of showing "Placed" with no indication of payout-eligibility state.
        placementVerified: m.placementRecord ? m.placementRecord.startDateVerified : null,
      };
    },
  );
}
