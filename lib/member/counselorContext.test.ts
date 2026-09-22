import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICATION_APPROVED_EVENT,
  WAIT_ESTIMATE_MIN_SAMPLE,
  WAIT_ESTIMATE_WINDOW_DAYS,
  awaitingStep,
  getMemberCounselorContext,
  medianApprovalDays,
  recentApprovalEventsWhere,
  type ApplicationSubmittedRow,
  type ApprovalEventRow,
  type CounselorContextDb,
  type CounselorContextUserRow,
} from './counselorContext';
import { MEMBER_ONLY_IDS, admittedIds, matchesWhere } from '../../tests/helpers/prismaWhereMatches';

const NOW = new Date('2026-09-22T16:00:00Z');
const DAY = 86_400_000;

function pendingRow(overrides: Partial<CounselorContextUserRow> = {}): CounselorContextUserRow {
  return {
    organizationId: 'org-1',
    applications: [{ status: 'PENDING' }],
    wioaReviewStatus: null,
    counselorAssignments: [],
    ...overrides,
  };
}

/** `n` approvals, each decided `days[i]` days after a submission inside the window. */
function approvals(days: number[]): { events: ApprovalEventRow[]; applications: ApplicationSubmittedRow[] } {
  const events: ApprovalEventRow[] = [];
  const applications: ApplicationSubmittedRow[] = [];
  days.forEach((d, i) => {
    const decided = new Date(NOW.getTime() - (i + 1) * DAY);
    events.push({ createdAt: decided, entityId: `app-${i}` });
    applications.push({ id: `app-${i}`, submittedAt: new Date(decided.getTime() - d * DAY) });
  });
  return { events, applications };
}

function fakeDb(
  row: CounselorContextUserRow | null,
  data: { events?: ApprovalEventRow[]; applications?: ApplicationSubmittedRow[] } = {},
) {
  const calls: { user: unknown[]; memberEvent: unknown[]; application: unknown[] } = {
    user: [], memberEvent: [], application: [],
  };
  const db: CounselorContextDb = {
    user: { findUnique: async (args) => { calls.user.push(args); return row; } },
    memberEvent: { findMany: async (args) => { calls.memberEvent.push(args); return data.events ?? []; } },
    application: { findMany: async (args) => { calls.application.push(args); return data.applications ?? []; } },
  };
  return { db, calls };
}

test('an assigned counselor is named by first name with a link to the member thread', async () => {
  const { db } = fakeDb(pendingRow({
    counselorAssignments: [{ counselor: { user: { fullName: '  Dana Whitfield ' } } }],
  }));
  const context = await getMemberCounselorContext('member-1', db, NOW);
  assert.deepEqual(context.counselor, {
    name: 'Dana Whitfield',
    firstName: 'Dana',
    messagingHref: '/dashboard/messages',
  });
  assert.equal(context.awaiting, 'approval');
});

test('no active assignment (or a blank counselor name) yields counselor: null', async () => {
  const unassigned = await getMemberCounselorContext('member-1', fakeDb(pendingRow()).db, NOW);
  assert.equal(unassigned.counselor, null);
  const blank = await getMemberCounselorContext(
    'member-1',
    fakeDb(pendingRow({ counselorAssignments: [{ counselor: { user: { fullName: '   ' } } }] })).db,
    NOW,
  );
  assert.equal(blank.counselor, null);
});

test('the user lookup reads only the active assignment, newest first', async () => {
  const { db, calls } = fakeDb(pendingRow());
  await getMemberCounselorContext('member-1', db, NOW);
  const args = calls.user[0] as { where: unknown; select: { counselorAssignments: { where: unknown; orderBy: unknown; take: number } } };
  assert.deepEqual(args.where, { id: 'member-1' });
  assert.deepEqual(args.select.counselorAssignments.where, { active: true });
  assert.deepEqual(args.select.counselorAssignments.orderBy, { assignedAt: 'desc' });
  assert.equal(args.select.counselorAssignments.take, 1);
});

test('the wait estimate is the median of recent approvals when at least five exist', async () => {
  // Durations 2, 3, 40, 41, 45 days → median 40.
  const { events, applications } = approvals([41, 2, 45, 3, 40]);
  const { db, calls } = fakeDb(pendingRow(), { events, applications });
  const context = await getMemberCounselorContext('member-1', db, NOW);
  assert.deepEqual(context.waitEstimate, { medianDays: 40, sampleSize: 5 });
  // The application lookup stays inside the member's organisation.
  const appArgs = calls.application[0] as { where: { id: { in: string[] }; user: { organizationId: string } } };
  assert.equal(appArgs.where.user.organizationId, 'org-1');
  assert.deepEqual([...appArgs.where.id.in].sort(), applications.map((a) => a.id).sort());
});

test('fewer than five recent approvals suppress the estimate instead of guessing', async () => {
  const { events, applications } = approvals([1, 1, 1, 1]);
  const context = await getMemberCounselorContext('member-1', fakeDb(pendingRow(), { events, applications }).db, NOW);
  assert.equal(context.waitEstimate, null);
  assert.equal(WAIT_ESTIMATE_MIN_SAMPLE, 5);
});

test('an even sample takes the mean of the two middle durations, rounded, never below one day', () => {
  const even = approvals([10, 20, 30, 40, 50, 60]);
  assert.deepEqual(medianApprovalDays(even.events, even.applications), { medianDays: 35, sampleSize: 6 });
  const sameDay = approvals([0.1, 0.2, 0.1, 0.3, 0.2]);
  assert.deepEqual(medianApprovalDays(sameDay.events, sameDay.applications), { medianDays: 1, sampleSize: 5 });
});

test('approvals with no saved submission date, no application, or a decision before submission are dropped', () => {
  const { events, applications } = approvals([5, 6, 7, 8, 9]);
  const dirty: ApprovalEventRow[] = [
    ...events,
    { createdAt: NOW, entityId: null },
    { createdAt: NOW, entityId: 'missing-app' },
    { createdAt: new Date(NOW.getTime() - 10 * DAY), entityId: 'future-submission' },
  ];
  const apps: ApplicationSubmittedRow[] = [
    ...applications,
    { id: 'future-submission', submittedAt: NOW },
    { id: 'no-date', submittedAt: null },
  ];
  assert.deepEqual(medianApprovalDays(dirty, apps), { medianDays: 7, sampleSize: 5 });
});

test('the approval query is scoped to the member population of the member\'s organisation and the 30-day window', async () => {
  const { db, calls } = fakeDb(pendingRow());
  await getMemberCounselorContext('member-1', db, NOW);
  const args = calls.memberEvent[0] as { where: ReturnType<typeof recentApprovalEventsWhere> };
  assert.equal(args.where.eventName, APPLICATION_APPROVED_EVENT);
  // Role predicate: only accounts the one member definition admits, in this org.
  assert.deepEqual(admittedIds(args.where.user, { organizationId: 'org-1' }), [...MEMBER_ONLY_IDS]);
  assert.deepEqual(admittedIds(args.where.user, { organizationId: 'org-2' }), []);
  // Window: 30 days back from `now`.
  const inside = new Date(NOW.getTime() - (WAIT_ESTIMATE_WINDOW_DAYS - 1) * DAY);
  const outside = new Date(NOW.getTime() - (WAIT_ESTIMATE_WINDOW_DAYS + 1) * DAY);
  assert.equal(matchesWhere(inside, args.where.createdAt), true);
  assert.equal(matchesWhere(outside, args.where.createdAt), false);
});

test('the estimate is only computed while the application itself is under review', async () => {
  const intake = fakeDb(pendingRow({ applications: [{ status: 'APPROVED' }], wioaReviewStatus: 'pending' }));
  const context = await getMemberCounselorContext('member-1', intake.db, NOW);
  assert.equal(context.awaiting, 'intake');
  assert.equal(context.waitEstimate, null);
  assert.equal(intake.calls.memberEvent.length, 0, 'no approval query for an approved application');
});

test('awaiting names the staff-owned step, or null once nothing is pending', () => {
  assert.equal(awaitingStep({ applications: [{ status: 'PENDING' }], wioaReviewStatus: null }), 'approval');
  assert.equal(awaitingStep({ applications: [{ status: 'NEEDS_INFO' }], wioaReviewStatus: null }), 'approval');
  assert.equal(awaitingStep({ applications: [{ status: 'APPROVED' }], wioaReviewStatus: null }), 'intake');
  assert.equal(awaitingStep({ applications: [{ status: 'APPROVED' }], wioaReviewStatus: 'in_review' }), 'intake');
  assert.equal(awaitingStep({ applications: [{ status: 'APPROVED' }], wioaReviewStatus: 'verified' }), null);
  assert.equal(awaitingStep({ applications: [{ status: 'APPROVED' }], wioaReviewStatus: 'not_eligible' }), null);
  assert.equal(awaitingStep({ applications: [{ status: 'DENIED' }], wioaReviewStatus: null }), null);
  assert.equal(awaitingStep({ applications: [], wioaReviewStatus: null }), null);
});

test('an unknown member yields an empty context and runs no further queries', async () => {
  const { db, calls } = fakeDb(null);
  assert.deepEqual(await getMemberCounselorContext('ghost', db, NOW), { counselor: null, waitEstimate: null, awaiting: null });
  assert.equal(calls.memberEvent.length, 0);
  assert.equal(calls.application.length, 0);
});
