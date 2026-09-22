import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const initial = () => ({ id: 'app-a', userId: 'member-a', status: 'PENDING', notes: null as string | null, programInterest: null, user: { email: 'member@example.invalid', fullName: 'Fixture', programInterest: null } });
  const member = () => ({ courseraEnrollmentApproved: true });
  const state = {
    application: initial(),
    snapshotFails: false,
    updates: 1,
    snapshots: [] as unknown[],
    member: member(),
    /** Other applications belonging to this member that are still APPROVED. */
    otherApprovedApplications: 0,
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 'member-a' }]),
    application: {
      findFirst: vi.fn(async () => ({ ...state.application })),
      updateMany: vi.fn(async (args: { data: { status: string; notes: string | null } }) => {
        if (state.updates === 1) Object.assign(state.application, args.data);
        return { count: state.updates };
      }),
      count: vi.fn(async () => state.otherApprovedApplications),
    },
    user: {
      updateMany: vi.fn(async (args: { where: { courseraEnrollmentApproved?: boolean }; data: { courseraEnrollmentApproved: boolean } }) => {
        // Mirrors the guarded write: no row matches once the flag is already
        // false, so the caller sees count 0 and logs nothing.
        if (args.where.courseraEnrollmentApproved === true && !state.member.courseraEnrollmentApproved) return { count: 0 };
        state.member.courseraEnrollmentApproved = args.data.courseraEnrollmentApproved;
        return { count: 1 };
      }),
    },
    counselorAssignment: { findFirst: vi.fn(async () => null) },
  };
  const transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => {
    const preimage = structuredClone(state.application);
    const priorSnapshots = [...state.snapshots];
    const memberPreimage = structuredClone(state.member);
    try { return await callback(tx); } catch (error) {
      state.application = preimage;
      state.snapshots = priorSnapshots;
      state.member = memberPreimage;
      throw error;
    }
  });
  return { state, tx, transaction, initial, member };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: fixture.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: vi.fn(() => true) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: vi.fn(), logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/email', () => ({ sendEnrollmentConfirmationEmail: vi.fn(async () => {}), sendApplicationRejectedEmail: vi.fn(async () => {}) }));
vi.mock('@/lib/content/programs', () => ({ getProgramByInterestValue: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/wioa/reviewSnapshot', () => ({ recordWioaReviewSnapshot: vi.fn(async (args: unknown, tx: unknown) => {
  if (tx !== fixture.tx) throw new Error('snapshot escaped transaction');
  if (fixture.state.snapshotFails) throw new Error('snapshot unavailable');
  fixture.state.snapshots.push(args);
}) }));

import { changeApplicationStatus } from '@/lib/admin/applicationReview';
import { auditLog } from '@/lib/audit';
import { sendEnrollmentConfirmationEmail, sendApplicationRejectedEmail } from '@/lib/email';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';
import { trackEvent } from '@/lib/events/track';

const args = { applicationId: 'app-a', status: 'APPROVED' as const, orgId: 'org-a', actorUserId: 'staff-a', actorRole: 'admin' as const, requestMeta: {} };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.state.application = fixture.initial();
  fixture.tx.$queryRaw.mockResolvedValue([{ id: 'member-a' }]);
  fixture.state.snapshotFails = false;
  fixture.state.updates = 1;
  fixture.state.snapshots = [];
  fixture.state.member = fixture.member();
  fixture.state.otherApprovedApplications = 0;
  fixture.tx.application.findFirst.mockImplementation(async () => ({ ...fixture.state.application }));
  fixture.tx.application.count.mockImplementation(async () => fixture.state.otherApprovedApplications);
  fixture.tx.counselorAssignment.findFirst.mockResolvedValue(null);
  vi.mocked(interactiveTransactionsGuaranteed).mockReturnValue(true);
  vi.mocked(auditLog).mockResolvedValue();
});

describe('application decision transaction', () => {
  it('refuses a denial without a written reason before any write (WAP-184 G-3)', async () => {
    const result = await changeApplicationStatus({ ...args, status: 'DENIED' });
    expect(result).toEqual({ ok: false, applicationId: 'app-a', error: expect.stringMatching(/written reason/i), status: 400 });
    expect(fixture.state.application.status).toBe('PENDING');
    expect(fixture.tx.application.updateMany).not.toHaveBeenCalled();
    expect(fixture.state.snapshots).toHaveLength(0);
    expect(auditLog).not.toHaveBeenCalled();
    expect(sendApplicationRejectedEmail).not.toHaveBeenCalled();
  });
  it('accepts a denial whose reason is already stored on the application', async () => {
    fixture.state.application.notes = 'Missing eligibility documents after two requests.';
    const result = await changeApplicationStatus({ ...args, status: 'DENIED' });
    expect(result.ok).toBe(true);
    expect(fixture.state.application.status).toBe('DENIED');
    expect(fixture.state.snapshots[0]).toMatchObject({ decision: 'DENIED', notes: 'Missing eligibility documents after two requests.' });
  });
  it('records the supplied reason with the denial evidence', async () => {
    const result = await changeApplicationStatus({ ...args, status: 'DENIED', notes: 'Applicant relocated out of state.' });
    expect(result.ok).toBe(true);
    expect(fixture.state.snapshots[0]).toMatchObject({ decision: 'DENIED', notes: 'Applicant relocated out of state.' });
  });
  it('commits evidence and audit with the tenant-scoped decision before sending', async () => {
    const result = await changeApplicationStatus(args);
    expect(result.ok).toBe(true);
    expect(fixture.state.application.status).toBe('APPROVED');
    expect(fixture.state.snapshots).toHaveLength(1);
    expect(fixture.tx.application.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user: { organizationId: 'org-a', deletedAt: null }, status: 'PENDING' }) }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'application_status_change' }), fixture.tx);
    expect(sendEnrollmentConfirmationEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(recordWioaReviewSnapshot).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendEnrollmentConfirmationEmail).mock.invocationCallOrder[0]);
  });
  it('rolls back a failed snapshot and sends no email/event; a retry commits once', async () => {
    fixture.state.snapshotFails = true;
    await expect(changeApplicationStatus(args)).rejects.toThrow('snapshot unavailable');
    expect(fixture.state.application.status).toBe('PENDING');
    expect(sendEnrollmentConfirmationEmail).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
    fixture.state.snapshotFails = false;
    await changeApplicationStatus(args);
    await changeApplicationStatus(args);
    expect(fixture.state.snapshots).toHaveLength(1);
    expect(sendEnrollmentConfirmationEmail).toHaveBeenCalledOnce();
  });
  it('rolls back the decision and evidence if the durable audit fails', async () => {
    vi.mocked(auditLog).mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(changeApplicationStatus(args)).rejects.toThrow('audit unavailable');
    expect(fixture.state.application.status).toBe('PENDING');
    expect(fixture.state.snapshots).toHaveLength(0);
    expect(sendEnrollmentConfirmationEmail).not.toHaveBeenCalled();
  });
  it('rejects an optimistic concurrency miss without a snapshot or notification', async () => {
    fixture.state.updates = 0;
    await expect(changeApplicationStatus(args)).rejects.toThrow('CONFLICT');
    expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
    expect(sendEnrollmentConfirmationEmail).not.toHaveBeenCalled();
  });
  it('never writes when transaction flattening is enabled', async () => {
    vi.mocked(interactiveTransactionsGuaranteed).mockReturnValue(false);
    await expect(changeApplicationStatus(args)).rejects.toThrow('TRANSACTION_UNAVAILABLE');
    expect(fixture.transaction).not.toHaveBeenCalled();
  });
  it('does not report a persisted decision as failed if a later contact lookup fails', async () => {
    fixture.tx.counselorAssignment.findFirst.mockRejectedValueOnce(new Error('contact lookup unavailable'));
    expect((await changeApplicationStatus(args)).ok).toBe(true);
    expect(fixture.state.snapshots).toHaveLength(1);
  });
  it('records a denial and suppresses duplicate denial emails on retry', async () => {
    await changeApplicationStatus({ ...args, status: 'DENIED', notes: 'Reason recorded' });
    await changeApplicationStatus({ ...args, status: 'DENIED', notes: 'Reason recorded' });
    expect(fixture.state.snapshots).toHaveLength(1);
    expect(sendApplicationRejectedEmail).toHaveBeenCalledOnce();
  });
  it('returns not-found without writes for a missing tenant-scoped application', async () => {
    fixture.tx.application.findFirst.mockResolvedValueOnce(null as never);
    expect(await changeApplicationStatus(args)).toEqual({ ok: false, applicationId: 'app-a', error: 'Application not found' });
    expect(fixture.tx.application.updateMany).not.toHaveBeenCalled();
  });
});


it('does not let a former counselor review after a handoff between preflight and the transaction', async () => {
  fixture.tx.counselorAssignment.findFirst.mockResolvedValueOnce(null);
  const result = await changeApplicationStatus({ ...args, actorRole: 'counselor' });
  expect(result).toEqual({ ok: false, applicationId: 'app-a', error: 'Application not found' });
  expect(fixture.tx.application.updateMany).not.toHaveBeenCalled();
  expect(recordWioaReviewSnapshot).not.toHaveBeenCalled();
  expect(sendEnrollmentConfirmationEmail).not.toHaveBeenCalled();
  expect(fixture.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(fixture.tx.counselorAssignment.findFirst.mock.invocationCallOrder[0]);
  expect(fixture.tx.counselorAssignment.findFirst).toHaveBeenCalledWith({ where: {
    memberId: 'member-a', active: true,
    counselor: { userId: 'staff-a', active: true, user: { organizationId: 'org-a', deletedAt: null } },
  }, select: { id: true } });
});

it('allows the current counselor to deny once a written reason is supplied (WAP-184 G-3)', async () => {
  // Before WAP-184 this asserted that a denial could commit with `notes: null`.
  // A denial reason is now mandatory for every actor role, counselors included.
  fixture.tx.counselorAssignment.findFirst.mockResolvedValueOnce({ id: 'assignment' } as never);
  const refused = await changeApplicationStatus({ ...args, actorRole: 'counselor', status: 'DENIED' });
  expect(refused).toMatchObject({ ok: false, status: 400 });
  expect(fixture.state.application.status).toBe('PENDING');

  fixture.tx.counselorAssignment.findFirst.mockResolvedValueOnce({ id: 'assignment' } as never);
  const result = await changeApplicationStatus({ ...args, actorRole: 'counselor', status: 'DENIED', notes: 'Did not complete intake after two follow-ups.' });
  expect(result.ok).toBe(true);
  expect(fixture.state.application.status).toBe('DENIED');
  expect(recordWioaReviewSnapshot).toHaveBeenCalledWith(expect.objectContaining({ decision: 'DENIED', notes: 'Did not complete intake after two follow-ups.' }), fixture.tx);
});

it('does not write if the subject leaves the tenant before the member lock', async () => {
  fixture.tx.$queryRaw.mockResolvedValueOnce([]);
  const result = await changeApplicationStatus(args);
  expect(result.ok).toBe(false);
  expect(fixture.tx.application.updateMany).not.toHaveBeenCalled();
});

/**
 * A denied application used to leave `User.courseraEnrollmentApproved` set, so
 * the dashboard approval card kept showing "Training approved" to a member who
 * had just been turned down. `DENIED` is the only closing state in
 * `ApplicationStatus`; `APPROVED` is the accepted outcome and must keep the
 * flag.
 */
describe('training approval when an application closes', () => {
  const denial = { ...args, status: 'DENIED' as const, notes: 'Did not meet eligibility.' };

  it('clears the training flag and audits it when the application is denied', async () => {
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(true);

    const result = await changeApplicationStatus(denial);

    expect(result.ok).toBe(true);
    expect(fixture.state.application.status).toBe('DENIED');
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(false);
    // The boolean and nothing else: whether the approved-at / approved-by
    // columns move with it is still Mike's call, so the write must not touch
    // them. This asserts the exact payload, so adding a column fails here.
    expect(fixture.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'member-a', courseraEnrollmentApproved: true },
      data: { courseraEnrollmentApproved: false },
    });
    const revokeCalls = vi.mocked(auditLog).mock.calls.filter(([entry]) => entry.action === 'coursera_enrollment_revoked');
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0][0]).toMatchObject({
      targetType: 'User',
      targetId: 'member-a',
      metadata: { source: 'application_denied', applicationId: 'app-a' },
    });
    expect(revokeCalls[0][1]).toBe(fixture.tx);
  });

  it('keeps the training flag when the application is approved', async () => {
    const result = await changeApplicationStatus(args);

    expect(result.ok).toBe(true);
    expect(fixture.state.application.status).toBe('APPROVED');
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(true);
    expect(fixture.tx.user.updateMany).not.toHaveBeenCalled();
    expect(vi.mocked(auditLog).mock.calls.filter(([entry]) => entry.action === 'coursera_enrollment_revoked')).toHaveLength(0);
  });

  it.each(['NEEDS_INFO', 'PENDING'] as const)('keeps the training flag for the open state %s', async (status) => {
    fixture.state.application.status = 'APPROVED';
    const result = await changeApplicationStatus({ ...args, status });

    expect(result.ok).toBe(true);
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(true);
    expect(fixture.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the training flag when the member still holds another approved application', async () => {
    fixture.state.otherApprovedApplications = 1;

    const result = await changeApplicationStatus(denial);

    expect(result.ok).toBe(true);
    expect(fixture.state.application.status).toBe('DENIED');
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(true);
    expect(fixture.tx.application.count).toHaveBeenCalledWith({
      where: { userId: 'member-a', status: 'APPROVED', id: { not: 'app-a' } },
    });
    expect(fixture.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('audits nothing when the member had no training approval to clear', async () => {
    fixture.state.member.courseraEnrollmentApproved = false;

    const result = await changeApplicationStatus(denial);

    expect(result.ok).toBe(true);
    expect(fixture.tx.user.updateMany).toHaveBeenCalledOnce();
    expect(vi.mocked(auditLog).mock.calls.filter(([entry]) => entry.action === 'coursera_enrollment_revoked')).toHaveLength(0);
  });

  it('rolls the cleared flag back with the decision when the evidence write fails', async () => {
    fixture.state.snapshotFails = true;

    await expect(changeApplicationStatus(denial)).rejects.toThrow('snapshot unavailable');

    expect(fixture.state.application.status).toBe('PENDING');
    expect(fixture.state.member.courseraEnrollmentApproved).toBe(true);
  });
});
