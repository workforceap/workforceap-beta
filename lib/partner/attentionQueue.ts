import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { buildAttentionPageQuery, encodeAttentionCursor, type AttentionCounts, type AttentionCursor, type AttentionQueryResult, type AttentionTier } from '@/lib/partner/attentionPagination';

export type RiskTier = 'high' | 'medium' | 'low' | 'watch';

export function staleDaysSince(updatedAt: Date, asOf = new Date()): number {
  return Math.floor((asOf.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeRiskTier(daysStale: number): RiskTier {
  if (daysStale >= 14) return 'high';
  if (daysStale >= 7) return 'medium';
  if (daysStale >= 3) return 'low';
  return 'watch';
}

export function nextBestAction(stage: string, tier: RiskTier): string {
  if (stage === 'approval_pending') {
    return 'Ask WorkforceAP to confirm enrollment approval and any funding steps before asking the member to start training.';
  }
  if (stage === 'applied') {
    if (tier === 'high' || tier === 'medium') return 'Check whether they need help completing their application or assessment.';
    return 'Send a quick check-in: offer to help finish enrollment steps.';
  }
  if (stage === 'enrolled') {
    return 'Confirm they can open their assigned courses and help them choose a first training session.';
  }
  if (stage === 'in_training') {
    return 'Check their latest course progress and ask what is blocking the next step; involve WorkforceAP if support is needed.';
  }
  return 'Review pipeline stage and schedule a touchpoint.';
}

export type PartnerAttentionRow = {
  memberId: string;
  fullName: string;
  stage: string;
  stageLabel: string;
  programTitle: string;
  staleDays: number;
  riskTier: RiskTier;
  nextBestAction: string;
  assignedPartnerUserId: string | null;
  assignedToName: string | null;
  lastTouchName: string | null;
};

const attentionInclude = {
  assignedPartnerUser: { select: { fullName: true } },
  member: {
    select: {
      id: true,
      fullName: true,
      enrolledProgram: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        select: { programSlug: true, curriculumVersion: true, isPrimary: true },
      },
      enrolledAt: true,
      courseraEnrollmentApproved: true,
      updatedAt: true,
      deletedAt: true,
      assessmentCompleted: true,
      placementRecord: {
        select: { employerName: true, jobTitle: true, salaryOffered: true, placedAt: true, startDateVerified: true },
      },
      userCertifications: { select: { certName: true, earnedAt: true } },
      applications: { select: { status: true, submittedAt: true } },
      memberProgramProgress: {
        select: { programSlug: true, averagePercent: true, coursesCompleted: true },
      },
    },
  },
} satisfies Prisma.PartnerReferralInclude;
export type AttentionReferral = Prisma.PartnerReferralGetPayload<{ include: typeof attentionInclude }>;

export function partnerAttentionRows(referrals: AttentionReferral[], lastTouchByMember: Map<string, string>, asOf = new Date()): PartnerAttentionRow[] {
  const rows: PartnerAttentionRow[] = [];

  for (const r of referrals) {
    const m = r.member;
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
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
    const pipelineStage = getPipelineStage(student);
    if (pipelineStage !== 'applied' && pipelineStage !== 'enrolled' && pipelineStage !== 'in_training') continue;
    // A saved program/enrollment row is not approval or proof of funded access.
    // Keep observed training activity visible even if a legacy approval flag
    // is absent; only pre-training enrollments use the pending label.
    const stage = pipelineStage === 'enrolled' && !m.courseraEnrollmentApproved
      ? 'approval_pending'
      : pipelineStage;

    const staleDays = staleDaysSince(m.updatedAt, asOf);
    const riskTier = computeRiskTier(staleDays);

    rows.push({
      memberId: m.id,
      fullName: m.fullName,
      stage,
      stageLabel: stage === 'approval_pending'
        ? 'Training approval pending'
        : PIPELINE_STAGE_LABELS[stage as keyof typeof PIPELINE_STAGE_LABELS] ?? stage,
      programTitle: assignment.programSlug ? programDisplayTitle(assignment.programSlug) : '—',
      staleDays,
      riskTier,
      nextBestAction: nextBestAction(stage, riskTier),
      assignedPartnerUserId: r.assignedPartnerUserId,
      assignedToName: r.assignedPartnerUser?.fullName ?? null,
      lastTouchName: lastTouchByMember.get(m.id) ?? null,
    });
  }

  return rows;
}

export type PartnerAttentionPage = {
  members: PartnerAttentionRow[]; counts: AttentionCounts; total: number; nextCursor: string | null; asOf: string;
};

export async function loadPartnerAttentionPage(
  partnerId: string, organizationId: string,
  options: { tier: AttentionTier; limit: number; asOf: Date; cursor?: AttentionCursor },
): Promise<PartnerAttentionPage> {
  // The count, page keys, and hydration share a repeatable-read snapshot. A later
  // request remains live: updated member rows may move; Refresh starts a new page set.
  return prisma.$transaction(async (tx) => {
    const [result] = await tx.$queryRaw<AttentionQueryResult[]>(buildAttentionPageQuery(partnerId, organizationId, options));
    if (!result) throw new Error('Partner attention query returned no aggregate');
    const keys = result.rows.slice(0, options.limit);
    const referrals = keys.length ? await tx.partnerReferral.findMany({
      where: { id: { in: keys.map(key => key.referralId) }, partnerId,
        partner: { organizationId, active: true }, member: { organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE } },
      include: attentionInclude,
    }) : [];
    const byId = new Map(referrals.map(referral => [referral.id, referral]));
    const ordered = keys.map(key => byId.get(key.referralId)).filter((value): value is AttentionReferral => value !== undefined);
    if (ordered.length !== keys.length) throw new Error('Partner attention page could not be fully loaded');
    const lastTouch = new Map(keys.filter(key => key.lastTouchName !== null).map(key => [key.memberId, key.lastTouchName!]));
    const last = keys.at(-1);
    const members = partnerAttentionRows(ordered, lastTouch, options.asOf);
    if (members.length !== keys.length) throw new Error('Partner attention eligibility changed; refresh the queue');
    return {
      members, counts: result.counts, total: result.counts[options.tier],
      nextCursor: result.rows.length > options.limit && last ? encodeAttentionCursor({
        v: 1, partnerId, organizationId, tier: options.tier, asOf: options.asOf.toISOString(),
        updatedAt: new Date(last.updatedAt).toISOString(), referralId: last.referralId,
      }) : null,
      asOf: options.asOf.toISOString(),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function countPartnerAttention(partnerId: string, organizationId: string): Promise<number> {
  const [result] = await prisma.$queryRaw<AttentionQueryResult[]>(buildAttentionPageQuery(partnerId, organizationId,
    { tier: 'all', asOf: new Date(), limit: 0, countsOnly: true }));
  if (!result) throw new Error('Partner attention query returned no aggregate');
  return result.counts.high + result.counts.medium + result.counts.low;
}

export function countActionablePartnerAttention(rows: PartnerAttentionRow[]): number {
  return rows.filter((r) => r.riskTier !== 'watch').length;
}
