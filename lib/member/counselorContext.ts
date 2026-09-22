import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { firstNameOf } from '@/lib/member/memberApprovalStatus';

/**
 * Who reviews a new member's application, and how long that has been taking.
 *
 * Owner call 2026-09-22 (Slack ts 1790092663.833649): the onboarding wizard
 * and the approval card promised "a counselor will follow up in 1 to 2
 * business days" while the queue sat at a ~40-day median. Every line here is
 * a saved fact instead:
 *
 *  - `counselor` is the member's active `CounselorAssignment` (#2350
 *    auto-assign or an admin handoff), accepted only when the counselor row is
 *    active and its user is live in the member's organisation: the same rule
 *    the messaging resolver applies (lib/messages/counselorThread.ts), so a
 *    name is never shown next to a "Message" link that routes to nobody.
 *  - `awaiting` names the step the member is waiting on: `approval` while
 *    staff review the application, `info` while the member owes information,
 *    `intake` once approved and the WIOA review is undecided.
 *  - `waitEstimate` is the median of (application_approved event time minus
 *    the application's saved `submittedAt`) over approvals in the member's
 *    organisation during the last {@link WAIT_ESTIMATE_WINDOW_DAYS} days,
 *    reported only from {@link WAIT_ESTIMATE_MIN_SAMPLE} decisions and only
 *    while `awaiting === 'approval'`. Otherwise null and the UI says nothing
 *    about timing.
 *
 * One resolver, two entry points: `loadMemberDashboardHome` reads the
 * assignment inside its own single user query and calls
 * {@link resolveAssignedCounselor}; the `?ui=legacy` wizard path, which has no
 * home loader, uses {@link getMemberCounselorContext}. The estimate is a
 * separate read ({@link getApprovalWaitEstimate}) so the home loader keeps
 * its one-operation budget.
 *
 * No schema change: approvals are the `application_approved` MemberEvent
 * that `lib/admin/applicationReview.ts` writes on every APPROVED decision.
 */

export const WAIT_ESTIMATE_WINDOW_DAYS = 30;
export const WAIT_ESTIMATE_MIN_SAMPLE = 5;
export const APPLICATION_APPROVED_EVENT = 'application_approved';
/** The member's own thread with their counselor (lib/messages/counselorThread.ts). */
const MEMBER_MESSAGES_HREF = '/dashboard/messages';

export type AssignedCounselor = {
  name: string;
  firstName: string;
  avatar?: string | null;
  messagingHref: string;
};

export type WaitEstimate = { medianDays: number; sampleSize: number };

export type AwaitingStep = 'approval' | 'info' | 'intake' | null;

export type MemberCounselorContext = {
  counselor: AssignedCounselor | null;
  waitEstimate: WaitEstimate | null;
  awaiting: AwaitingStep;
};

export const EMPTY_COUNSELOR_CONTEXT: MemberCounselorContext = { counselor: null, waitEstimate: null, awaiting: null };

/** The assignment row {@link counselorAssignmentSelect} returns. */
export type AssignedCounselorRow = {
  counselor: {
    active: boolean;
    user: { fullName: string | null; organizationId: string; deletedAt: Date | null } | null;
  } | null;
};

export type CounselorResolutionRow = {
  organizationId: string;
  counselorAssignments: AssignedCounselorRow[];
};

export type AwaitingFacts = {
  applications?: Array<{ status: string }>;
  wioaReviewStatus?: string | null;
};

export type CounselorContextUserRow = CounselorResolutionRow & {
  applications: Array<{ status: string }>;
  wioaReviewStatus: string | null;
};

export type ApprovalEventRow = { createdAt: Date; entityId: string | null };
export type ApplicationSubmittedRow = { id: string; submittedAt: Date | null };

/** Injectable for unit tests; production passes the shared Prisma client. */
export type WaitEstimateDb = {
  memberEvent: { findMany: (args: unknown) => Promise<ApprovalEventRow[]> };
  application: { findMany: (args: unknown) => Promise<ApplicationSubmittedRow[]> };
};
export type CounselorContextDb = WaitEstimateDb & {
  user: { findUnique: (args: unknown) => Promise<CounselorContextUserRow | null> };
};

const INTAKE_DECIDED = new Set(['verified', 'not_eligible']);

/**
 * Nested `counselorAssignments` select shared by the home loader and
 * {@link getMemberCounselorContext}: the newest active assignment whose
 * counselor row is active and whose user is not deleted. The organisation
 * check needs the member's own `organizationId`, which a nested filter cannot
 * reference, so {@link resolveAssignedCounselor} applies it on the row.
 */
export function counselorAssignmentSelect() {
  return {
    where: { active: true, counselor: { active: true, user: { deletedAt: null } } },
    orderBy: { assignedAt: 'desc' as const },
    take: 1,
    select: {
      counselor: {
        select: {
          active: true,
          user: { select: { fullName: true, organizationId: true, deletedAt: true } },
        },
      },
    },
  };
}

export function resolveAssignedCounselor(row: CounselorResolutionRow): AssignedCounselor | null {
  const counselor = row.counselorAssignments[0]?.counselor;
  const user = counselor?.user;
  if (!counselor?.active || !user || user.deletedAt || user.organizationId !== row.organizationId) return null;
  const name = user.fullName?.trim();
  if (!name) return null;
  return { name, firstName: firstNameOf(name), messagingHref: MEMBER_MESSAGES_HREF };
}

export function awaitingStep(row: AwaitingFacts): AwaitingStep {
  const status = row.applications?.[0]?.status;
  if (status === 'PENDING') return 'approval';
  if (status === 'NEEDS_INFO') return 'info';
  if (status === 'APPROVED' && !INTAKE_DECIDED.has(row.wioaReviewStatus ?? '')) return 'intake';
  return null;
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

/**
 * Median days from submission to approval. Pairs each approval event with its
 * application's saved `submittedAt`; events with no application, no saved
 * submission date, or a decision recorded before the submission are dropped
 * rather than guessed. Rounded to whole days, never below one.
 */
export function medianApprovalDays(
  events: ApprovalEventRow[],
  applications: ApplicationSubmittedRow[],
): WaitEstimate | null {
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

/** Two reads (events, then their applications). Callers run it only while `awaiting === 'approval'`. */
export async function getApprovalWaitEstimate(
  organizationId: string,
  db?: WaitEstimateDb,
  now: Date = new Date(),
): Promise<WaitEstimate | null> {
  const client: WaitEstimateDb = db ?? (prisma as unknown as WaitEstimateDb);
  const since = new Date(now.getTime() - WAIT_ESTIMATE_WINDOW_DAYS * 86_400_000);
  const events = await client.memberEvent.findMany({
    where: recentApprovalEventsWhere(organizationId, since),
    select: { createdAt: true, entityId: true },
  });
  const ids = [...new Set(events.map((event) => event.entityId).filter((id): id is string => Boolean(id)))];
  const applications = ids.length > 0
    ? await client.application.findMany({
        where: { id: { in: ids }, user: { organizationId } },
        select: { id: true, submittedAt: true },
      })
    : [];
  return medianApprovalDays(events, applications);
}

/** Standalone loader for the `?ui=legacy` wizard path (one user read, plus the estimate while under review). */
export async function getMemberCounselorContext(
  userId: string,
  db?: CounselorContextDb,
  now: Date = new Date(),
): Promise<MemberCounselorContext> {
  const client: CounselorContextDb = db ?? (prisma as unknown as CounselorContextDb);
  const row = await client.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      applications: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
      wioaReviewStatus: true,
      counselorAssignments: counselorAssignmentSelect(),
    },
  });
  if (!row) return EMPTY_COUNSELOR_CONTEXT;
  const awaiting = awaitingStep(row);
  return {
    counselor: resolveAssignedCounselor(row),
    awaiting,
    waitEstimate: awaiting === 'approval' ? await getApprovalWaitEstimate(row.organizationId, client, now) : null,
  };
}
