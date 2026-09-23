import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * The admin Today approval-queue loader (lib/admin/loadAdminApprovalQueue.ts)
 * against a mocked Prisma (WAP-190): every query is pinned to the actor's
 * organization — for a super-admin too — none filters on an enrolled program,
 * scans are bounded, and the rows it yields render in the shared kit list
 * with admin destinations and an honest "showing N of M".
 */
const db = vi.hoisted(() => ({
  applicationFindMany: vi.fn(),
  applicationCount: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
}));
const scopeCalls = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: unknown, fn: (client: unknown) => Promise<unknown>) => {
    scopeCalls.push(orgId);
    return fn({
      application: { findMany: db.applicationFindMany, count: db.applicationCount },
      user: { findMany: db.userFindMany, count: db.userCount },
    });
  }),
}));

import { loadAdminApprovalQueue } from '@/lib/admin/loadAdminApprovalQueue';
import { CounselorApprovalQueue } from '@/components/portal/kit/pages/counselor/CounselorApprovalQueue';
import { emptyApprovalQueue } from '@/lib/counselor/approvalQueue';

const NOW = new Date('2026-09-22T12:00:00Z');
const SCREENING = {
  version: 2, submittedAt: '2026-09-01T10:00:00Z', signal: 'likely', reasons: [],
  answers: { ageBracket: '25_54', countyOrZip: '77002', primaryBarrier: 'none', dislocatedWorker: false, lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: true },
};

function pendingApplication(id: string, memberId: string, submittedAt: string, enrolledProgram: string | null = null) {
  return {
    id, status: 'PENDING', programInterest: 'it-support', submittedAt: new Date(submittedAt), createdAt: new Date(submittedAt),
    user: { id: memberId, fullName: `Name ${memberId}`, email: `${memberId}@example.test`, enrolledProgram },
  };
}

function seed() {
  db.applicationFindMany.mockImplementation(async (args: { where: { status: unknown }; select: Record<string, unknown> }) => {
    // The workbench-order read selects ids only.
    if (Object.keys(args.select).length === 1) return [{ id: 'w-0' }, { id: 'a-old' }, { id: 'a-new' }];
    return [
      pendingApplication('a-old', 'm-applicant', '2026-08-08T12:00:00Z', null),
      pendingApplication('a-new', 'm-enrolled', '2026-09-21T12:00:00Z', 'it-support'),
    ];
  });
  db.applicationCount.mockImplementation(async (args: { where: { status: unknown } }) =>
    (JSON.stringify(args.where.status) === JSON.stringify({ in: ['PENDING'] }) ? 75 : 4));
  db.userFindMany.mockResolvedValue([
    {
      id: 'm-intake', fullName: null, email: 'intake@example.test', enrolledProgram: null,
      wioaReviewStatus: 'pending', wioaReviewedAt: null, wioaQualificationJson: SCREENING,
    },
  ]);
  db.userCount.mockResolvedValue(6);
}

beforeEach(() => {
  vi.clearAllMocks();
  scopeCalls.length = 0;
  seed();
});
afterEach(cleanup);

describe('loadAdminApprovalQueue', () => {
  it.each([
    ['an org admin', false],
    ['a super-admin (still pinned to their own org, like the workbench)', true],
  ])('scopes every query to the actor org for %s', async (_label, superAdmin) => {
    const scope = { ok: true as const, orgId: 'org-1', superAdmin };
    await loadAdminApprovalQueue(scope, { now: NOW });
    // Every read gets a tenant-scoped client pinned to the actor org, whether or
    // not the actor is a super-admin (six reads: 3 lists, 3 counts).
    expect(scopeCalls).toEqual(Array(6).fill(scope.orgId));

    const [pending, workbench] = db.applicationFindMany.mock.calls.map((call) => call[0]);
    expect(pending.where).toEqual({
      status: { in: ['PENDING'] },
      user: { organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE },
    });
    expect(workbench.where).toEqual({ status: { in: ['PENDING', 'NEEDS_INFO'] }, user: { organizationId: 'org-1', deletedAt: null } });
    expect(workbench.select).toEqual({ id: true });

    const intakes = db.userFindMany.mock.calls[0][0];
    expect(intakes.where).toMatchObject({
      organizationId: 'org-1',
      deletedAt: null,
      wioaReviewStatus: { in: ['pending', 'in_review'] },
      wioaQualificationJson: { not: Prisma.DbNull },
      NOT: MEMBER_ONLY_WHERE.NOT,
    });

    const counts = db.applicationCount.mock.calls.map((call) => call[0].where);
    expect(counts).toEqual([
      pending.where,
      { status: 'NEEDS_INFO', user: { organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE } },
    ]);
    expect(db.userCount.mock.calls[0][0].where).toEqual(intakes.where);

    // No enrolled-program condition anywhere: unenrolled applicants are the point.
    const everyWhere = [...db.applicationFindMany.mock.calls, ...db.applicationCount.mock.calls, ...db.userFindMany.mock.calls, ...db.userCount.mock.calls]
      .map((call) => JSON.stringify(call[0].where));
    for (const where of everyWhere) expect(where).not.toContain('enrolledProgram');
  });

  it('bounds every scan and reads oldest first in workbench order', async () => {
    await loadAdminApprovalQueue({ ok: true, orgId: 'org-1', superAdmin: false }, { now: NOW });
    const [pending, workbench] = [db.applicationFindMany.mock.calls[0][0], db.applicationFindMany.mock.calls[1][0]];
    const intakes = db.userFindMany.mock.calls[0][0];
    for (const args of [pending, workbench, intakes]) {
      expect(args.take).toBeGreaterThan(0);
      expect(args.take).toBeLessThanOrEqual(500);
    }
    expect(pending.orderBy).toEqual([{ submittedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }]);
    expect(workbench.orderBy).toEqual(pending.orderBy);
    expect(intakes.orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);
  });

  it('includes the applicant with no enrolled program, orders across kinds, counts every decision and links each row where it is decided', async () => {
    const approvals = await loadAdminApprovalQueue({ ok: true, orgId: 'org-1', superAdmin: false }, { now: NOW });
    expect(approvals.queue.rows.map((row) => row.key)).toEqual([
      'application:m-applicant:a-old',
      'intake:m-intake',
      'application:m-enrolled:a-new',
    ]);
    expect(approvals.queue.rows[0].enrolledProgram).toBeNull();
    expect(approvals.queue.rows[1].memberName).toBe('intake@example.test');
    expect(approvals.queue.rows[1].waitingSince?.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(approvals.total).toBe(81);
    expect(approvals.applications).toMatchObject({ waiting: 75, waitingOnApplicant: 4 });
    expect(approvals.intakes.waiting).toBe(6);
    expect(approvals.rowHrefs).toEqual({
      'application:m-applicant:a-old': '/admin/command-center?queue=applications&page=1#application-a-old',
      'intake:m-intake': '/admin/members/m-intake?tab=eligibility',
      'application:m-enrolled:a-new': '/admin/command-center?queue=applications&page=1#application-a-new',
    });
  });

  it('renders in the shared kit list with admin destinations and says how much is not shown', async () => {
    const approvals = await loadAdminApprovalQueue({ ok: true, orgId: 'org-1', superAdmin: false }, { now: NOW });
    render(
      <CounselorApprovalQueue
        queue={approvals.queue}
        total={approvals.total}
        rowHrefs={approvals.rowHrefs}
        retryHref="/admin"
        description="Every application and intake check in your organization that is waiting on a staff decision, oldest first."
        moreLinks={[
          { label: 'Applications', href: '/admin/command-center?queue=applications' },
          { label: 'Funding eligibility', href: '/admin/wioa-screening' },
        ]}
      />,
    );
    const section = screen.getByTestId('today-approval-queue');
    const rows = within(section).getAllByTestId('approval-row');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(Object.values(approvals.rowHrefs));
    expect(rows.every((row) => !row.getAttribute('href')?.startsWith('/counselor'))).toBe(true);
    expect(section).toHaveAttribute('data-count', '3');
    expect(section).toHaveAttribute('data-total', '81');
    expect(section).toHaveTextContent('81 decisions');
    expect(section).toHaveTextContent('in your organization');
    expect(section).not.toHaveTextContent('only you can move');
    const note = within(section).getByTestId('approval-queue-truncated');
    expect(note).toHaveTextContent('Showing the 3 oldest of 81 decisions. The rest are in Applications and Funding eligibility.');
    expect(within(note).getByRole('link', { name: 'Applications' })).toHaveAttribute('href', '/admin/command-center?queue=applications');
    expect(within(note).getByRole('link', { name: 'Funding eligibility' })).toHaveAttribute('href', '/admin/wioa-screening');
    expect(rows[0]).toHaveTextContent('45 days waiting');
    expect(rows[0]).toHaveClass('wa-kit-tone--alert');
  });

  it('an empty list never prints a stale count over "Nothing is waiting on you"', () => {
    render(<CounselorApprovalQueue queue={emptyApprovalQueue()} total={5} retryHref="/admin" emptyDescription="Nothing in your organization." />);
    const section = screen.getByTestId('today-approval-queue');
    expect(section).toHaveTextContent('0 decisions');
    expect(section).toHaveAttribute('data-total', '0');
    expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent('Nothing is waiting on you');
    expect(within(section).queryByTestId('approval-queue-truncated')).toBeNull();
  });
});
