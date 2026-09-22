import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * Who reviews a new member's application, and how long that has been taking.
 *
 * Owner call 2026-09-22 (Slack ts 1790092663.833649): the onboarding wizard
 * and the approval card promised "a counselor will follow up in 1 to 2
 * business days" while the queue sat at a ~40-day median. Every line here is
 * a saved fact instead:
 *
 *  - `counselor` is the member's active `CounselorAssignment` (#2350
 *    auto-assign or an admin handoff), named from the counselor's user row.
 *  - `waitEstimate` is the median of (application_approved event time minus
 *    the application's saved `submittedAt`) over approvals in the member's
 *    organisation during the last {@link WAIT_ESTIMATE_WINDOW_DAYS} days. It
 *    is only reported when at least {@link WAIT_ESTIMATE_MIN_SAMPLE}
 *    decisions exist, and only while the member is waiting on that review;
 *    otherwise it is null and the UI says nothing about timing.
 *  - `awaiting` names the staff-owned step the member is waiting on.
 *
 * No schema change: approvals are the `application_approved` MemberEvent
 * that `lib/admin/applicationReview.ts` writes on every APPROVED decision.
 */

export const WAIT_ESTIMATE_WINDOW_DAYS = 30;
export const WAIT_ESTIMATE_MIN_SAMPLE = 5;
export const APPLICATION_APPROVED_EVENT = 'application_approved';
/** The member's own thread with their counselor (lib/messages/counselorThread.ts). */
export const MEMBER_MESSAGES_HREF = '/dashboard/messages';

export type MemberCounselorContext = {
  counselor: {
    name: string;
    firstName: string;
    avatar?: string | null;
    messagingHref: string;
  } | null;
  waitEstimate: { medianDays: number; sampleSize: number } | null;
  awaiting: 'intake' | 'approval' | null;
};

export type CounselorContextUserRow = {
  organizationId: string;
  applications: Array<{ status: string }>;
  wioaReviewStatus: string | null;
  counselorAssignments: Array<{
    counselor: { user: { fullName: string | null } | null } | null;
  }>;
};

export type ApprovalEventRow = { createdAt: Date; entityId: string | null };
export type ApplicationSubmittedRow = { id: string; submittedAt: Date | null };

/** Injectable for unit tests; production passes the shared Prisma client. */
export type CounselorContextDb = {
  user: { findUnique: (args: unknown) => Promise<CounselorContextUserRow | null> };
  memberEvent: { findMany: (args: unknown) => Promise<ApprovalEventRow[]> };
  application: { findMany: (args: unknown) => Promise<ApplicationSubmittedRow[]> };
};

const INTAKE_DECIDED = new Set(['verified', 'not_eligible']);

export function counselorContextUserSelect() {
  return {
    organizationId: true,
    applications: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
    wioaReviewStatus: true,
    counselorAssignments: {
      where: { active: true },
      orderBy: { assignedAt: 'desc' as const },
      take: 1,
      select: { counselor: { select: { user: { select: { fullName: true } } } } },
    },
  };
}

/**
 * Recent approvals in one organisation, restricted to members by the one
 * member definition (MEMBER_ONLY_WHERE) so a staff dogfood account approving
 * itself never shortens the estimate.
 */
export function recentApprovalEventsWhere(
  organizationId: string,
  since: Date,
): Prisma.MemberEventWhereInput {
  return {
    eventName: APPLICATION_APPROVED_EVENT,
    createdAt: { gte: since },
    user: { organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
  };
}

export function awaitingStep(row: Pick<CounselorContextUserRow, 'applications' | 'wioaReviewStatus'>): MemberCounselorContext['awaiting'] {
  const status = row.applications[0]?.status;
  if (status === 'PENDING' || status === 'NEEDS_INFO') return 'approval';
  if (status === 'APPROVED' && !INTAKE_DECIDED.has(row.wioaReviewStatus ?? '')) return 'intake';
  return null;
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim();
}

/**
 * Median days from submission to approval. Pairs each approval event with its
 * application's saved `submittedAt`; events with no application, no saved
 * submission date, or a decision recorded before the submission are dropped
 * rather than guessed. Rounded to whole days, never below one.
 */
export function medianApprovalDays(
  events: ApprovalEventRow[],
  applications: ApplicationSubmittedRow[],
): { medianDays: number; sampleSize: number } | null {
  const submittedById = new Map(applications.map((app) => [app.id, app.submittedAt]));
  const durations: number[] = [];
  for (const event of events) {
    if (!event.entityId) continue;
    const submittedAt = submittedById.get(event.entityId);
    if (!submittedAt) continue;
    const ms = event.createdAt.getTime() - submittedAt.getTime();
    if (ms < 0) continue;
    durations.push(ms / 86_400_000);
  }
  if (durations.length < WAIT_ESTIMATE_MIN_SAMPLE) return null;
  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median = durations.length % 2 === 1
    ? durations[mid]
    : (durations[mid - 1] + durations[mid]) / 2;
  return { medianDays: Math.max(1, Math.round(median)), sampleSize: durations.length };
}

export async function getMemberCounselorContext(
  userId: string,
  db?: CounselorContextDb,
  now: Date = new Date(),
): Promise<MemberCounselorContext> {
  const client: CounselorContextDb = db ?? (prisma as unknown as CounselorContextDb);
  const row = await client.user.findUnique({
    where: { id: userId },
    select: counselorContextUserSelect(),
  });
  if (!row) return { counselor: null, waitEstimate: null, awaiting: null };

  const fullName = row.counselorAssignments[0]?.counselor?.user?.fullName?.trim() || null;
  const counselor = fullName
    ? { name: fullName, firstName: firstNameOf(fullName), messagingHref: MEMBER_MESSAGES_HREF }
    : null;

  const awaiting = awaitingStep(row);
  let waitEstimate: MemberCounselorContext['waitEstimate'] = null;
  if (awaiting === 'approval') {
    const since = new Date(now.getTime() - WAIT_ESTIMATE_WINDOW_DAYS * 86_400_000);
    const events = await client.memberEvent.findMany({
      where: recentApprovalEventsWhere(row.organizationId, since),
      select: { createdAt: true, entityId: true },
    });
    const ids = [...new Set(events.map((event) => event.entityId).filter((id): id is string => Boolean(id)))];
    const applications = ids.length > 0
      ? await client.application.findMany({
          where: { id: { in: ids }, user: { organizationId: row.organizationId } },
          select: { id: true, submittedAt: true },
        })
      : [];
    waitEstimate = medianApprovalDays(events, applications);
  }

  return { counselor, waitEstimate, awaiting };
}
