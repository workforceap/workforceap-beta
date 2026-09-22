import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVAL_SLA_BUSINESS_DAYS,
  approvalAgeLabel,
  approvalTone,
  buildApprovalQueue,
  businessDaysBetween,
  calendarDaysBetween,
  intakeWaitingSince,
  type ApprovalQueueMemberFacts,
} from './approvalQueue';

/** Tuesday. */
const NOW = new Date('2026-09-22T12:00:00Z');
const at = (iso: string) => new Date(iso);

function member(overrides: Partial<ApprovalQueueMemberFacts> & { memberId: string }): ApprovalQueueMemberFacts {
  return {
    memberName: overrides.memberId,
    memberEmail: `${overrides.memberId}@example.test`,
    enrolledProgram: null,
    applications: [],
    wioaReviewStatus: null,
    wioaReviewedAt: null,
    wioaScreeningSubmittedAt: null,
    ...overrides,
  };
}

function application(id: string, status: string, submittedAt: string | null, createdAt = '2026-01-01T00:00:00Z') {
  return { id, status, programInterest: 'it-support', submittedAt: submittedAt ? at(submittedAt) : null, createdAt: at(createdAt) };
}

test('business days skip weekends: Friday noon to Monday noon is one, a week is five, the same day is zero', () => {
  assert.equal(businessDaysBetween(at('2026-09-18T12:00:00Z'), at('2026-09-21T12:00:00Z')), 1);
  assert.equal(businessDaysBetween(at('2026-09-14T09:00:00Z'), at('2026-09-21T09:00:00Z')), 5);
  assert.equal(businessDaysBetween(at('2026-09-22T08:00:00Z'), NOW), 0);
  assert.equal(businessDaysBetween(at('2026-09-16T12:00:00Z'), at('2026-09-18T12:00:00Z')), 2);
  // Submitted on a Saturday: the following Monday is the first business day.
  assert.equal(businessDaysBetween(at('2026-09-19T12:00:00Z'), at('2026-09-21T12:00:00Z')), 1);
  assert.equal(businessDaysBetween(NOW, at('2026-09-01T00:00:00Z')), 0, 'future anchors never go negative');
  assert.equal(calendarDaysBetween(at('2026-08-08T12:00:00Z'), NOW), 45);
});

test('tone: at the SLA is quiet, strictly over it is warn, strictly over twice it is alert', () => {
  assert.equal(APPROVAL_SLA_BUSINESS_DAYS, 2, 'the default Mike can change in lib/counselor/approvalQueue.ts');
  assert.equal(approvalTone(0), 'muted');
  assert.equal(approvalTone(2), 'muted');
  assert.equal(approvalTone(3), 'warn');
  assert.equal(approvalTone(4), 'warn');
  assert.equal(approvalTone(5), 'alert');
  assert.equal(approvalTone(null), 'muted');
  assert.equal(approvalTone(4, 3), 'warn', 'threshold is a parameter');
  assert.equal(approvalTone(7, 3), 'alert');
});

test('age label is plain English in calendar days', () => {
  assert.equal(approvalAgeLabel(0), 'Under a day waiting');
  assert.equal(approvalAgeLabel(1), '1 day waiting');
  assert.equal(approvalAgeLabel(45), '45 days waiting');
  assert.equal(approvalAgeLabel(null), 'Waiting time not recorded');
});

test('only PENDING applications wait on the counselor; the clock starts at submission, not creation', () => {
  const queue = buildApprovalQueue([
    member({
      memberId: 'm-app',
      applications: [
        application('a-pending', 'PENDING', '2026-08-08T12:00:00Z', '2026-07-01T00:00:00Z'),
        application('a-info', 'NEEDS_INFO', '2026-09-01T00:00:00Z'),
        application('a-ok', 'APPROVED', '2026-09-01T00:00:00Z'),
        application('a-no', 'DENIED', '2026-09-01T00:00:00Z'),
      ],
    }),
    member({ memberId: 'm-draft', applications: [application('a-draft', 'PENDING', null, '2026-09-17T09:00:00Z')] }),
  ], NOW);
  assert.deepEqual(queue.rows.map((r) => r.key), ['application:m-app:a-pending', 'application:m-draft:a-draft']);
  const [old, draft] = queue.rows;
  assert.equal(old.daysWaiting, 45);
  assert.equal(old.businessDaysWaiting, 32);
  assert.equal(old.tone, 'alert');
  assert.equal(old.ageLabel, '45 days waiting');
  assert.equal(old.awaiting, 'Application decision');
  assert.equal(old.programInterest, 'it-support');
  assert.equal(draft.waitingSince?.toISOString(), '2026-09-17T09:00:00.000Z', 'createdAt is the fallback when submittedAt is missing');
  assert.equal(draft.businessDaysWaiting, 3);
  assert.equal(draft.tone, 'warn');
});

test('intake waits on pending / in_review only, dated from the screening the member handed in', () => {
  const screening = at('2026-09-10T10:00:00Z');
  assert.equal(
    intakeWaitingSince({ wioaReviewStatus: 'pending', wioaReviewedAt: null, wioaScreeningSubmittedAt: screening }),
    screening,
  );
  // A staff reset back to pending (reviewedAt newer than the submission) restarts the clock.
  const reset = at('2026-09-18T10:00:00Z');
  assert.equal(
    intakeWaitingSince({ wioaReviewStatus: 'pending', wioaReviewedAt: reset, wioaScreeningSubmittedAt: screening }),
    reset,
  );
  // Marking "in review" is not a decision: the clock keeps running from the submission.
  assert.equal(
    intakeWaitingSince({ wioaReviewStatus: 'in_review', wioaReviewedAt: reset, wioaScreeningSubmittedAt: screening }),
    screening,
  );
  assert.equal(
    intakeWaitingSince({ wioaReviewStatus: 'in_review', wioaReviewedAt: reset, wioaScreeningSubmittedAt: null }),
    reset,
    'without a stored screening date the staff timestamp is the only anchor',
  );

  const queue = buildApprovalQueue([
    member({ memberId: 'm-pending', wioaReviewStatus: 'pending', wioaScreeningSubmittedAt: screening }),
    member({ memberId: 'm-review', wioaReviewStatus: 'in_review', wioaScreeningSubmittedAt: screening, wioaReviewedAt: reset }),
    member({ memberId: 'm-info', wioaReviewStatus: 'needs_info', wioaScreeningSubmittedAt: screening }),
    member({ memberId: 'm-verified', wioaReviewStatus: 'verified', wioaScreeningSubmittedAt: screening }),
    member({ memberId: 'm-not', wioaReviewStatus: 'not_eligible', wioaScreeningSubmittedAt: screening }),
    member({ memberId: 'm-none', wioaReviewStatus: null }),
    member({ memberId: 'm-undated', wioaReviewStatus: 'pending' }),
  ], NOW);
  assert.deepEqual(queue.rows.map((r) => r.memberId), ['m-pending', 'm-review', 'm-undated']);
  assert.equal(queue.rows[0].detail, 'Intake not yet verified');
  assert.equal(queue.rows[1].detail, 'Intake in review');
  assert.equal(queue.rows[0].daysWaiting, 12);
  assert.equal(queue.rows[0].businessDaysWaiting, 8);
  assert.equal(queue.rows[0].tone, 'alert');
  assert.equal(queue.rows[2].waitingSince, null, 'a waiting status with no stored timestamp is still listed');
  assert.equal(queue.rows[2].tone, 'muted');
  assert.equal(queue.rows[2].ageLabel, 'Waiting time not recorded');
});

test('rows sort oldest first across both kinds; undated rows last; totals equal the rows', () => {
  const queue = buildApprovalQueue([
    member({ memberId: 'm-fresh', applications: [application('a1', 'PENDING', '2026-09-18T12:00:00Z')] }),
    member({ memberId: 'm-both', applications: [application('a2', 'PENDING', '2026-09-17T09:00:00Z')], wioaReviewStatus: 'pending', wioaScreeningSubmittedAt: at('2026-09-10T10:00:00Z') }),
    member({ memberId: 'm-old', applications: [application('a3', 'PENDING', '2026-08-08T12:00:00Z')] }),
    member({ memberId: 'm-undated', wioaReviewStatus: 'pending' }),
  ], NOW);
  assert.deepEqual(
    queue.rows.map((r) => r.key),
    ['application:m-old:a3', 'intake:m-both', 'application:m-both:a2', 'application:m-fresh:a1', 'intake:m-undated'],
  );
  assert.deepEqual(queue.rows.map((r) => r.tone), ['alert', 'alert', 'warn', 'muted', 'muted']);
  assert.equal(queue.totals.waiting, queue.rows.length);
  assert.equal(queue.totals.overSla, 3);
  assert.equal(queue.totals.overDoubleSla, 2);
  assert.equal(queue.slaBusinessDays, APPROVAL_SLA_BUSINESS_DAYS);
  assert.equal(queue.rows[3].businessDaysWaiting, 2, 'Friday noon to Tuesday noon is two business days: at the SLA, not over it');
  assert.equal(queue.rows[3].ageLabel, '4 days waiting');
});

test('a caseload with nothing pending yields an empty queue', () => {
  const queue = buildApprovalQueue([member({ memberId: 'm-ok', applications: [application('a', 'APPROVED', '2026-09-01T00:00:00Z')], wioaReviewStatus: 'verified' })], NOW);
  assert.deepEqual(queue.rows, []);
  assert.deepEqual(queue.totals, { waiting: 0, overSla: 0, overDoubleSla: 0 });
});
