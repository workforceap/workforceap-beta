import { beforeEach, describe, expect, it, vi } from 'vitest';

// WAP-20: a self-reported certification is pending until staff approve it,
// and the credential's downstream effects run on that approval.

const afterCallbacks: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
  after: (fn: () => unknown) => { afterCallbacks.push(fn); },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org_1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
  memberInOrg: vi.fn(() => ({})),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: never[]) => Promise<Response>) => handler,
  withUserGuc: vi.fn(async (_user: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}), auditRequestMeta: vi.fn(() => ({})) }));
vi.mock('@/lib/certifications/certificationApproved', () => ({ runCertificationApprovedEffects: vi.fn(async () => {}) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => ({ awarded: true })) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => ({})) }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn(async () => {}) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    userCertification: { findFirst: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST as review } from '@/app/api/admin/certifications/review/route';
import { logExternalCertification } from '@/app/(portal)/dashboard/logCertAction';
import { runCertificationApprovedEffects } from '@/lib/certifications/certificationApproved';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';

const reviewRequest = (body: unknown) => new Request('http://localhost/api/admin/certifications/review', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

async function flushAfter() {
  while (afterCallbacks.length) await afterCallbacks.shift()!();
}

describe('admin certification review fires credential effects on first approval (WAP-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    vi.mocked(getUser).mockResolvedValue({ id: 'admin_1' } as never);
    vi.mocked(prisma.userCertification.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it('approving a pending self-report fires the effects once and audits the decision', async () => {
    vi.mocked(prisma.userCertification.findFirst).mockResolvedValue({
      id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: null,
    } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(prisma.userCertification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'cert_1', status: 'pending' }),
      data: expect.objectContaining({ status: 'approved', reviewedById: 'admin_1', reviewedAt: expect.any(Date) }),
    }));
    expect(runCertificationApprovedEffects).toHaveBeenCalledTimes(1);
    expect(runCertificationApprovedEffects).toHaveBeenCalledWith({ userId: 'member_1', certName: 'CompTIA A+' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_certification_approved', targetId: 'cert_1' }));
  });

  it('rejecting fires no credential effects', async () => {
    vi.mocked(prisma.userCertification.findFirst).mockResolvedValue({
      id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: null,
    } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'reject' }) as never);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(prisma.userCertification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'rejected' }),
    }));
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
  });

  it('re-approving after a proof upload does not repeat the effects', async () => {
    vi.mocked(prisma.userCertification.findFirst).mockResolvedValue({
      id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: new Date('2026-09-01'),
    } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
  });

  it('refuses to review a row that is not pending', async () => {
    vi.mocked(prisma.userCertification.findFirst).mockResolvedValue({
      id: 'cert_1', status: 'approved', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: new Date(),
    } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);

    expect(res.status).toBe(400);
    expect(prisma.userCertification.updateMany).not.toHaveBeenCalled();
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
  });
});

describe('dashboard server action logs an external certification as pending (WAP-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member_1' } as never);
    vi.mocked(prisma.userCertification.upsert).mockResolvedValue({} as never);
  });

  it('creates the row pending with a submission time and leaves an existing row\'s status alone', async () => {
    const form = new FormData();
    form.set('certName', 'Google IT Support');
    form.set('earnedAt', '2026-09-01');

    await logExternalCertification(form);

    const call = vi.mocked(prisma.userCertification.upsert).mock.calls[0][0] as {
      create: Record<string, unknown>; update: Record<string, unknown>;
    };
    expect(call.create).toMatchObject({ userId: 'member_1', certName: 'Google IT Support', status: 'pending', submittedAt: expect.any(Date) });
    expect(call.update).not.toHaveProperty('status');
  });
});

describe('runCertificationApprovedEffects', () => {
  it('runs the lifecycle event, points, notification and partner milestone, each isolated', async () => {
    const { runCertificationApprovedEffects: run } = await vi.importActual<typeof import('@/lib/certifications/certificationApproved')>(
      '@/lib/certifications/certificationApproved',
    );
    const { trackEvent } = await import('@/lib/events/track');
    const { awardPoints } = await import('@/lib/member/points');
    const { createNotification } = await import('@/lib/notifications/create');
    const { sendPartnerMilestoneEmail } = await import('@/lib/notifications/partner-notify');
    vi.mocked(awardPoints).mockRejectedValueOnce(new Error('points down'));

    await expect(run({ userId: 'member_1', certName: 'CompTIA A+' })).resolves.toBeUndefined();

    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member_1', eventName: 'certification_earned', metadata: { certName: 'CompTIA A+' } }));
    expect(awardPoints).toHaveBeenCalledWith('member_1', 'certification_earned', 'CompTIA A+');
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member_1', type: 'certificate_earned' }));
    expect(sendPartnerMilestoneEmail).toHaveBeenCalledWith('member_1', 'Certification earned', { Certification: 'CompTIA A+' });
  });
});
