import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { resolveActorSnapshot } from '@/lib/audit';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import type { Prisma } from '@prisma/client';
import { captureApiError } from '@/lib/observability/captureApiError';

/**
 * Immutable eligibility decision trail — see the `WioaReviewSnapshot` model
 * comment in prisma/schema.prisma for why this exists and why the subject
 * (`userId`/`applicationId`) is a plain column, not a foreign key.
 *
 * Every write goes through `recordWioaReviewSnapshot`. There is no update or
 * delete path for this table by design — never add one; a correction is a
 * new row, same as the source-of-truth WIOA statuses this exists to audit.
 */

export type WioaReviewSnapshotSource = 'wioa_review' | 'application_decision' | 'enrollment_funding';

type RecordSnapshotArgs = {
  organizationId: string;
  userId: string;
  applicationId?: string | null;
  source: WioaReviewSnapshotSource;
  decision: string;
  notes?: string | null;
  actorUserId: string | null;
  funding?: { enrollmentId: string; previousSource: string | null; source: string | null };
};

/**
 * Freeze the member's WIOA-relevant eligibility fields at this moment —
 * self-screening answers plus the profile barrier/income/veteran/disability
 * data a WIOA monitoring review would ask to see alongside the decision.
 */
async function buildEligibilitySnapshot(db: Prisma.TransactionClient, userId: string, organizationId: string) {
  const member = await db.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    select: {
      email: true,
      fullName: true,
      programInterest: true,
      wioaQualificationJson: true,
      wioaReviewStatus: true,
      applyEligibilityScreenings: {
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true, createdAt: true, q1: true, q2: true, q3: true,
          qualifies: true, yesCount: true, receivingUnemployment: true,
          exhaustedUnemployment: true, layoffCompany: true, snapWic: true,
          // WAP-53: benefit detail and help request travel with the decision evidence.
          publicAssistancePrograms: true, publicAssistanceHelpRequested: true,
        },
      },
      preScreeningResponse: {
        select: {
          id: true, organizationId: true, createdAt: true, employmentStatus: true,
          primaryGoal: true, weeklyHours: true, barrier: true, workforceAssistance: true,
        },
      },
      profile: {
        select: {
          dob: true,
          veteranStatus: true,
          employmentStatus: true,
          employmentStatusAtEnroll: true,
          educationLevel: true,
          householdIncome: true,
          usCitizen: true,
          authorizedToWork: true,
          hasDisability: true,
          hasEmploymentBarrier: true,
          barrierTypes: true,
          isMinor: true,
        },
      },
    },
  });
  if (!member) throw new Error('WIOA_SNAPSHOT_MEMBER_NOT_FOUND');
  if (member.preScreeningResponse && member.preScreeningResponse.organizationId !== organizationId) {
    throw new Error('WIOA_SNAPSHOT_SCREENING_SCOPE_MISMATCH');
  }
  return member;
}

/** Required transaction client: a decision and its evidence must commit together. */
export async function recordWioaReviewSnapshot(args: RecordSnapshotArgs, db: Prisma.TransactionClient): Promise<void> {
  const { organizationId, userId, applicationId, source, decision, notes, actorUserId } = args;

  try {
    const [member, actorSnapshot] = await Promise.all([
      buildEligibilitySnapshot(db, userId, organizationId),
      resolveActorSnapshot(actorUserId, db),
    ]);
    if (actorUserId && actorSnapshot.exists !== true) {
      throw new Error('WIOA_SNAPSHOT_ACTOR_UNAVAILABLE');
    }
    // Convert Date values explicitly for a durable, versioned JSON document.
    // These remain self-reported answers, not a board eligibility determination.
    const eligibilitySnapshot = JSON.parse(JSON.stringify({
      version: 2,
      evidenceType: 'self_reported_intake',
      programInterest: member.programInterest,
      wioaReviewStatusAtDecision: member.wioaReviewStatus,
      selfScreening: parseWioaQualificationSnapshot(member.wioaQualificationJson),
      applyScreening: member.applyEligibilityScreenings[0] ?? null,
      preScreening: member.preScreeningResponse,
      profile: member.profile,
      ...(args.funding ? { funding: args.funding } : {}),
    })) as Prisma.InputJsonObject;
    await db.wioaReviewSnapshot.create({
      data: {
        organizationId,
        userId,
        memberEmailSnapshot: member.email,
        memberNameSnapshot: member.fullName,
        applicationId: applicationId ?? null,
        source,
        decision,
        notes: notes ?? null,
        actorUserId,
        actorEmailSnapshot: actorSnapshot.email,
        actorRoleSnapshot: actorSnapshot.role,
        eligibilitySnapshot,
      },
    });
  } catch (error) {
    captureApiError(error, { route: 'lib/wioa/reviewSnapshot' });
    throw error;
  }
}

export type WioaReviewSnapshotRow = {
  id: string;
  source: string;
  decision: string;
  notes: string | null;
  actorEmailSnapshot: string | null;
  actorRoleSnapshot: string | null;
  createdAt: Date;
};

/** Read-only decision history for a member, newest first. */
export async function loadWioaReviewSnapshots(
  userId: string,
  organizationId: string,
): Promise<WioaReviewSnapshotRow[]> {
  return prisma.wioaReviewSnapshot.findMany({
    where: { userId, organizationId },
    select: {
      id: true,
      source: true,
      decision: true,
      notes: true,
      actorEmailSnapshot: true,
      actorRoleSnapshot: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}
