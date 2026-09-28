import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { eventNameReadCandidates } from '@/lib/events/names';
import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';
import {
  partnerDataAccess,
  partnerPlacementSelect,
  partnerVisiblePlacement,
  withPartnerMemberVisibility,
  PARTNER_PROGRESS_STAGE_LABELS,
  partnerProgressStage,
  type PartnerDataAccess,
} from '@/lib/partner/dataAccess';
import { applicationStatusKey, applicationStatusLabel } from '@/lib/status/applicationStatusVocabulary';

const referralMemberBaseSelect = {
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
  userCertifications: { select: { certName: true, earnedAt: true } },
  applications: { select: { status: true, submittedAt: true } },
  memberProgramProgress: {
    select: { programSlug: true, averagePercent: true, coursesCompleted: true },
  },
} as const;

// WAP-171: privacy policy §3.3 lets a referring partner see enrollment
// status, progress and outcomes. Ethnicity and veteran status (§1.2
// eligibility & demographic data) are never loaded for partner surfaces.
const REFERRAL_PROFILE_SELECT = {
  city: true,
  state: true,
  zip: true,
  employmentStatus: true,
  educationLevel: true,
} as const;

/**
 * The member select for this partner's tier (lib/partner/dataAccess.ts).
 * Restricted (referral-track) partners never load the profile or any job
 * detail of a placement — the fields are not read from the database at all.
 */
function referralMemberSelect(access: PartnerDataAccess) {
  return {
    ...referralMemberBaseSelect,
    placementRecord: { select: partnerPlacementSelect(access) },
    ...(access.canSeeProfileDetails ? { profile: { select: REFERRAL_PROFILE_SELECT } } : {}),
  };
}

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
  /** Job fields are null for restricted partners (lib/partner/dataAccess.ts). */
  placementRecord: {
    employerName: string | null;
    jobTitle: string | null;
    salaryOffered: number | null;
    placedAt: Date | null;
    /** Same field the partner payout flow gates on (see lib/partner/payoutEligibility.ts). */
    startDateVerified: boolean;
    onboardingWindowEnd: Date | null;
    retentionDecision: string | null;
  } | null;
  /** Always null for restricted partners. */
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

/**
 * @param tenantOrganizationId — Partner portal tenant boundary: partner row
 *   and referred members must belong to this org (defense against orphaned /
 *   cross-tenant referral rows).
 *
 * The partner's data tier and minor visibility are resolved here from the
 * stored partner row — never from the caller — so every page, API route and
 * export built on this bundle gets the same server-side rule
 * (lib/partner/dataAccess.ts). `access` is returned so callers can shape
 * columns and copy without re-deriving it.
 */
export async function loadPartnerReferralBundle(partnerId: string, tenantOrganizationId: string) {
  const partnerRow = await prisma.partner.findFirst({
    where: { id: partnerId, organizationId: tenantOrganizationId },
    select: { partnerType: true },
  });
  const access = partnerDataAccess(partnerRow);
  if (!partnerRow) {
    return {
      referrals: [],
      members: [] as ReferralMember[],
      pipelineMembers: [] as PipelineRow[],
      pendingPlacements: [] as { userId: string; eventName: string; createdAt: Date }[],
      access,
    };
  }

  const referrals = await prisma.partnerReferral.findMany({
    take: 500,
    where: {
      partnerId,
      partner: { organizationId: tenantOrganizationId },
      member: withPartnerMemberVisibility({
        deletedAt: null,
        organizationId: tenantOrganizationId,
        ...MEMBER_ONLY_WHERE,
      }, access),
    },
    include: {
      member: { select: referralMemberSelect(access) },
    },
    orderBy: { referredAt: 'desc' },
  });

  const memberIds = referrals.map((r) => r.member.id);

  const ninetyDaysAgo = pendingPlacementWindowStart();

  // Load pending placement confirmations (self-reported by members, not yet reviewed)
  const pendingMemberIds = referrals
    .filter((row) => row.member.placementRecord?.startDateVerified !== true)
    .map((row) => row.member.id);
  const pendingPlacements =
    pendingMemberIds.length === 0
      ? []
      : await prisma.memberEvent.findMany({
        take: 500,
          where: {
            userId: { in: pendingMemberIds },
            eventName: { in: eventNameReadCandidates('placement_confirmation_submitted') },
            createdAt: { gte: ninetyDaysAgo },
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['userId'],
          select: {
            userId: true,
            eventName: true,
            createdAt: true,
          },
        });

  const pipelineMembers: PipelineRow[] = [];

  for (const r of referrals) {
    const raw = r.member as Omit<ReferralMember, 'placementRecord' | 'profile'> & {
      placementRecord?: Parameters<typeof partnerVisiblePlacement>[1];
      profile?: ReferralMember['profile'];
    };
    // Project through the tier rule even though the select is already
    // narrowed: a widened select can never pass job details through.
    const visiblePlacement = partnerVisiblePlacement(access, raw.placementRecord);
    const m: ReferralMember = {
      ...raw,
      placementRecord: visiblePlacement
        ? {
            employerName: visiblePlacement.employerName,
            jobTitle: visiblePlacement.jobTitle,
            salaryOffered: visiblePlacement.salaryOffered,
            placedAt: visiblePlacement.placedAt,
            startDateVerified: visiblePlacement.startDateVerified,
            onboardingWindowEnd: visiblePlacement.onboardingWindowEnd,
            retentionDecision: visiblePlacement.retentionDecision,
          }
        : null,
      profile: access.canSeeProfileDetails ? raw.profile ?? null : null,
    };
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    const program = assignment.programSlug
      ? getProgramBySlug(assignment.programSlug)
      : null;
    const verifiedPlacement = m.placementRecord?.startDateVerified === true ? m.placementRecord : null;
    const student: PipelineStudent = {
      id: m.id,
      fullName: m.fullName,
      email: '',
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      enrolledAt: m.enrolledAt,
      assessmentCompleted: m.assessmentCompleted,
      deletedAt: m.deletedAt,
      placementRecord: verifiedPlacement as PipelineStudent['placementRecord'],
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

  return { referrals, members, pipelineMembers, pendingPlacements, access };
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
      // Restricted partners load no employer / job title: "Placed" only.
      const story = m.placementRecord?.startDateVerified === true
        ? m.placementRecord.employerName && m.placementRecord.jobTitle
          ? `Placed at ${m.placementRecord.employerName} as ${m.placementRecord.jobTitle}`
          : PARTNER_PLACEMENT_LABELS.verifiedWithoutDetails
        : m.placementRecord
          ? PARTNER_PLACEMENT_LABELS.pendingVerification
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

/**
 * The status-only row a restricted (referral-track) partner may export: the
 * allowlist in lib/partner/dataAccess.ts and nothing else. Built from the
 * already tier-narrowed bundle; no contact, location, employment or job field
 * exists on the input to leak.
 */
export type PartnerStatusOnlyRow = {
  id: string;
  fullName: string;
  applicationStatus: string;
  applicationSubmittedAt: Date | null;
  programTitle: string;
  progressStage: string;
  certifications: string[];
  placed: boolean;
  placedAt: Date | null;
  referredAt: Date;
};

export function toPartnerStatusOnlyRows(pipelineMembers: PipelineRow[]): PartnerStatusOnlyRow[] {
  return pipelineMembers.map(({ member: m, referredAt, progress, programTitle }) => {
    const latestApplication = [...m.applications].sort(
      (a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0),
    )[0];
    const placed = m.placementRecord?.startDateVerified === true;
    return {
      id: m.id,
      fullName: m.fullName,
      applicationStatus: applicationStatusLabel(applicationStatusKey(latestApplication?.status), 'member'),
      applicationSubmittedAt: latestApplication?.submittedAt ?? null,
      programTitle,
      progressStage: PARTNER_PROGRESS_STAGE_LABELS[
        partnerProgressStage({
          enrolled: m.enrolledAt != null || m.courseEnrollments.length > 0,
          progressPct: progress,
        })
      ],
      certifications: m.userCertifications.map((c) => c.certName),
      placed,
      placedAt: placed ? m.placementRecord?.placedAt ?? null : null,
      referredAt,
    };
  });
}
