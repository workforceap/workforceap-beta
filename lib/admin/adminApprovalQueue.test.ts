import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { APPROVAL_SLA_BUSINESS_DAYS } from '@/lib/counselor/approvalQueue';
import {
  ADMIN_APPROVAL_QUEUE_LIMIT,
  adminApplicationDecisionHref,
  adminApplicationsAwaitingApplicantWhere,
  adminApplicationsAwaitingDecisionWhere,
  adminApplicationsQueueCopy,
  adminIntakeDecisionHref,
  adminIntakesAwaitingDecisionWhere,
  buildAdminApprovalQueue,
  emptyAdminApprovalQueue,
  type AdminApprovalApplicationRow,
  type AdminApprovalIntakeRow,
} from './adminApprovalQueue';

/**
 * Admin Today "Waiting on your decision" (WAP-190): every PENDING
 * application and waiting intake in the org — not the enrolled-only admin
 * caseload — oldest first, bounded, with an honest total and a link per row
 * to the screen that records the decision.
 */

/** Tuesday. */
const NOW = new Date('2026-09-22T12:00:00Z');

function app(id: string, memberId: string, submittedAt: string | null, overrides: Partial<AdminApprovalApplicationRow['user']> = {}): AdminApprovalApplicationRow {
  const at = submittedAt ? new Date(submittedAt) : new Date('2026-09-21T12:00:00Z');
  return {
    id,
    status: 'PENDING',
    programInterest: 'it-support',
    submittedAt: submittedAt ? at : null,
    createdAt: at,
    user: { id: memberId, fullName: `Name ${memberId}`, email: `${memberId}@example.test`, enrolledProgram: null, ...overrides },
  };
}

function intake(id: string, submittedAt: string, status = 'pending'): AdminApprovalIntakeRow {
  return {
    id,
    fullName: `Name ${id}`,
    email: `${id}@example.test`,
    enrolledProgram: 'it-support',
    wioaReviewStatus: status,
    wioaReviewedAt: null,
    wioaScreeningSubmittedAt: new Date(submittedAt),
  };
}

const counts = (applicationsWaiting: number, intakesWaiting: number, applicationsWaitingOnApplicant = 0) => ({
  applicationsWaiting,
  applicationsWaitingOnApplicant,
  intakesWaiting,
});

test('where clauses: org-scoped, members only, no enrolled-program condition, and the intake screening must be on file', () => {
  const decision = adminApplicationsAwaitingDecisionWhere('org-1');
  assert.deepEqual(decision.status, { in: ['PENDING'] });
  assert.deepEqual(decision.user, { organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE });

  const applicant = adminApplicationsAwaitingApplicantWhere('org-1');
  assert.equal(applicant.status, 'NEEDS_INFO');
  assert.deepEqual(applicant.user, decision.user);

  const intakes = adminIntakesAwaitingDecisionWhere('org-1');
  assert.equal(intakes.organizationId, 'org-1');
  assert.equal(intakes.deletedAt, null);
  assert.deepEqual(intakes.wioaReviewStatus, { in: ['pending', 'in_review'] });
  assert.deepEqual(intakes.wioaQualificationJson, { not: Prisma.DbNull });
  assert.deepEqual(intakes.NOT, MEMBER_ONLY_WHERE.NOT);

  // Applicants have no enrolled program until they are approved: the admin
  // caseload scope (enrolledProgram NOT NULL) is exactly what hid them.
  for (const where of [decision, applicant, intakes]) {
    assert.doesNotMatch(JSON.stringify(where), /enrolledProgram/);
  }
});

test('lists applicants who have not enrolled, merged per member, oldest first across applications and intakes', () => {
  const approvals = buildAdminApprovalQueue(
    {
      applications: [
        app('a-new', 'm-new', '2026-09-21T12:00:00Z'),
        app('a-old', 'm-old', '2026-08-08T12:00:00Z'),
        app('a-both', 'm-both', '2026-09-10T12:00:00Z'),
      ],
      intakes: [intake('m-intake', '2026-09-01T10:00:00Z', 'in_review'), intake('m-both', '2026-09-15T10:00:00Z')],
      counts: counts(3, 2),
      workbenchOrder: [],
    },
    NOW,
  );
  assert.deepEqual(approvals.queue.rows.map((row) => row.key), [
    'application:m-old:a-old',
    'intake:m-intake',
    'application:m-both:a-both',
    'intake:m-both',
    'application:m-new:a-new',
  ]);
  assert.equal(approvals.queue.rows[0].enrolledProgram, null, 'an applicant with no enrolled program is listed');
  assert.equal(approvals.queue.rows[0].applicationId, 'a-old');
  assert.equal(approvals.queue.rows[1].applicationId, null);
  assert.equal(approvals.queue.slaBusinessDays, APPROVAL_SLA_BUSINESS_DAYS);
  assert.equal(approvals.total, 5);
  assert.equal(approvals.queue.totals.waiting, 5);
  assert.equal(approvals.applications.oldest?.key, 'application:m-old:a-old');
  assert.equal(approvals.applications.oldest?.daysWaiting, 45);
  assert.equal(approvals.applications.oldest?.tone, 'alert');
});

test('bounded: shows the oldest rows only and keeps the full count as the total', () => {
  const applications = Array.from({ length: 60 }, (_, i) =>
    app(`a-${i}`, `m-${i}`, new Date(Date.UTC(2026, 6, 1 + i, 12)).toISOString()),
  );
  const approvals = buildAdminApprovalQueue({ applications, intakes: [], counts: counts(75, 0), workbenchOrder: [] }, NOW);
  assert.equal(ADMIN_APPROVAL_QUEUE_LIMIT, 50);
  assert.equal(approvals.queue.rows.length, 50);
  assert.equal(approvals.queue.totals.waiting, 50, 'totals describe the rows on screen');
  assert.equal(approvals.total, 75, 'the org-wide count, not the scanned or shown rows');
  assert.equal(approvals.queue.rows[0].applicationId, 'a-0');
  assert.equal(approvals.queue.rows[49].applicationId, 'a-49');
  assert.equal(Object.keys(approvals.rowHrefs).length, 50);

  const small = buildAdminApprovalQueue({ applications, intakes: [], counts: counts(60, 0), workbenchOrder: [] }, NOW, 10);
  assert.equal(small.queue.rows.length, 10);
  // A count read a moment before a new row landed never undercounts the screen.
  const racing = buildAdminApprovalQueue({ applications: applications.slice(0, 3), intakes: [], counts: counts(1, 0), workbenchOrder: [] }, NOW);
  assert.equal(racing.total, 3);
});

test('each row opens the screen that records its decision', () => {
  const workbenchOrder = Array.from({ length: 30 }, (_, i) => `w-${i}`);
  workbenchOrder[27] = 'a-late';
  workbenchOrder[3] = 'a-early';
  const approvals = buildAdminApprovalQueue(
    {
      applications: [app('a-early', 'm-1', '2026-08-01T12:00:00Z'), app('a-late', 'm-2', '2026-08-02T12:00:00Z'), app('a-unplaced', 'm-3', '2026-08-03T12:00:00Z')],
      intakes: [intake('m-4', '2026-08-04T12:00:00Z')],
      counts: counts(3, 1),
      workbenchOrder,
    },
    NOW,
  );
  assert.deepEqual(approvals.rowHrefs, {
    'application:m-1:a-early': '/admin/command-center?queue=applications&page=1#application-a-early',
    'application:m-2:a-late': '/admin/command-center?queue=applications&page=2#application-a-late',
    'application:m-3:a-unplaced': '/admin/command-center?queue=applications&page=1',
    'intake:m-4': '/admin/members/m-4?tab=eligibility',
  });
  assert.equal(adminApplicationDecisionHref('x', 50), '/admin/command-center?queue=applications&page=3#application-x');
  assert.equal(adminIntakeDecisionHref('a b'), '/admin/members/a%20b?tab=eligibility');
});

test('applications copy: waiting on your decision and waiting on the applicant are two numbers; urgent past the SLA', () => {
  const stale = buildAdminApprovalQueue(
    { applications: [app('a-1', 'm-1', '2026-09-01T12:00:00Z')], intakes: [], counts: counts(12, 0, 3), workbenchOrder: [] },
    NOW,
  );
  assert.deepEqual(adminApplicationsQueueCopy(stale), {
    title: '12 applications are waiting on your decision',
    detail: 'Oldest: 21 days waiting · 3 others are waiting on the applicant for more information',
    urgent: true,
  });

  // Friday noon -> Tuesday noon is two business days: at the SLA, not over it.
  const fresh = buildAdminApprovalQueue(
    { applications: [app('a-1', 'm-1', '2026-09-18T12:00:00Z')], intakes: [], counts: counts(1, 0, 1), workbenchOrder: [] },
    NOW,
  );
  assert.deepEqual(adminApplicationsQueueCopy(fresh), {
    title: '1 application is waiting on your decision',
    detail: 'Oldest: 4 days waiting · 1 other is waiting on the applicant for more information',
    urgent: false,
  });

  // Only intakes waiting: the applications row is not urgent and has no oldest age.
  const intakesOnly = buildAdminApprovalQueue(
    { applications: [], intakes: [intake('m-1', '2026-08-01T12:00:00Z')], counts: counts(0, 1), workbenchOrder: [] },
    NOW,
  );
  assert.equal(intakesOnly.applications.oldest, null);
  assert.deepEqual(adminApplicationsQueueCopy(intakesOnly), {
    title: '0 applications are waiting on your decision',
    detail: 'None waiting on the applicant',
    urgent: false,
  });
});

test('the empty queue is a real zero, not a missing one', () => {
  const empty = emptyAdminApprovalQueue();
  assert.deepEqual(empty.queue.rows, []);
  assert.deepEqual(empty.queue.totals, { waiting: 0, overSla: 0, overDoubleSla: 0 });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rowHrefs, {});
  assert.equal(empty.queue.slaBusinessDays, APPROVAL_SLA_BUSINESS_DAYS);
});
