import { beforeEach, describe, expect, it, vi } from 'vitest';

// O02/M06: approving or rejecting a pending certificate is a compare-and-set.
// Two admins (or one double-click) reviewing the same row produce exactly one
// decision; the credential effects run once, and the loser gets a 409 instead
// of silently overwriting the first decision.

const afterCallbacks: Array<() => unknown> = [];
// One shared client for both the prisma and withTenantScope mocks, so
// concurrent requests never race a dynamic import of the prisma module.
const db = vi.hoisted(() => ({
  userCertification: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
  after: (fn: () => unknown) => { afterCallbacks.push(fn); },
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org_1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (client: unknown) => Promise<unknown>) => fn(db)),
  memberInOrg: vi.fn((orgId: string) => ({ user: { organizationId: orgId } })),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: never[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}), auditRequestMeta: vi.fn(() => ({})) }));
vi.mock('@/lib/certifications/certificationApproved', () => ({ runCertificationApprovedEffects: vi.fn(async () => {}) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));

import { POST as review } from '@/app/api/admin/certifications/review/route';
import { runCertificationApprovedEffects } from '@/lib/certifications/certificationApproved';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

type Row = {
  id: string;
  userId: string;
  certName: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: Date | null;
  reviewedById: string | null;
  orgId: string;
};

type Where = {
  id?: string;
  status?: string;
  reviewedAt?: Date | null;
  user?: { organizationId?: string };
};

/**
 * An in-memory userCertification table that honours the `where` clause the
 * way Postgres would: `update` writes the row by id unconditionally, while
 * `updateMany` only touches rows matching every predicate and reports how
 * many it changed.
 */
function fakeTable(initial: Row) {
  const rows = new Map<string, Row>([[initial.id, { ...initial }]]);
  const matches = (row: Row, where: Where) =>
    (where.id === undefined || row.id === where.id)
    && (where.status === undefined || row.status === where.status)
    && (where.reviewedAt === undefined || row.reviewedAt === where.reviewedAt)
    && (where.user?.organizationId === undefined || row.orgId === where.user.organizationId);
  const pick = (row: Row, select?: Record<string, boolean>) => {
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k as keyof Row]]));
  };

  // Hold every read until `readersToAlign` requests have read, so concurrent
  // requests all observe the row before either writes (the race window).
  let readersToAlign = 0;
  let aligned = 0;
  let release: () => void = () => {};
  let gate = Promise.resolve();
  const alignReads = (n: number) => {
    readersToAlign = n;
    aligned = 0;
    gate = new Promise<void>((resolve) => { release = resolve; });
  };

  vi.mocked(prisma.userCertification.findFirst).mockImplementation((async (args: { where: Where; select?: Record<string, boolean> }) => {
    const row = [...rows.values()].find((r) => matches(r, args.where));
    const snapshot = row ? pick(row, args.select) : null;
    if (aligned < readersToAlign) {
      aligned += 1;
      if (aligned === readersToAlign) release();
      await gate;
    }
    return snapshot;
  }) as never);
  vi.mocked(prisma.userCertification.update).mockImplementation((async (args: { where: Where; data: Partial<Row>; select?: Record<string, boolean> }) => {
    const row = rows.get(args.where.id!);
    if (!row) throw new Error('Record to update not found');
    Object.assign(row, args.data);
    return pick(row, args.select);
  }) as never);
  vi.mocked(prisma.userCertification.updateMany).mockImplementation((async (args: { where: Where; data: Partial<Row> }) => {
    let count = 0;
    for (const row of rows.values()) {
      if (matches(row, args.where)) {
        Object.assign(row, args.data);
        count += 1;
      }
    }
    return { count };
  }) as never);

  return { rows, alignReads };
}

const reviewRequest = (body: unknown) => new Request('http://localhost/api/admin/certifications/review', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

async function flushAfter() {
  while (afterCallbacks.length) await afterCallbacks.shift()!();
}

const pendingRow = (over: Partial<Row> = {}): Row => ({
  id: 'cert_1',
  userId: 'member_1',
  certName: 'CompTIA A+',
  status: 'pending',
  reviewedAt: null,
  reviewedById: null,
  orgId: 'org_1',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Drop any queued once-implementations so one case cannot leak into the next.
  vi.mocked(prisma.userCertification.findFirst).mockReset();
  vi.mocked(prisma.userCertification.update).mockReset();
  vi.mocked(prisma.userCertification.updateMany).mockReset();
  afterCallbacks.length = 0;
  vi.mocked(getUser).mockImplementation((async () => ({ id: 'admin_1' })) as never);
  vi.mocked(isAdmin).mockResolvedValue(true);
});

describe('admin certification review is compare-and-set (O02/M06)', () => {
  it('two admins approving the same pending certificate at once produce one approval and one 409', async () => {
    const table = fakeTable(pendingRow());
    table.alignReads(2);
    vi.mocked(getUser)
      .mockResolvedValueOnce({ id: 'admin_1' } as never)
      .mockResolvedValueOnce({ id: 'admin_2' } as never);

    const [a, b] = await Promise.all([
      review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never),
      review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never),
    ]);
    await flushAfter();

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await loser.json()).toEqual({ error: 'Certification was already reviewed', status: 'approved' });

    expect(runCertificationApprovedEffects).toHaveBeenCalledTimes(1);
    expect(runCertificationApprovedEffects).toHaveBeenCalledWith({ userId: 'member_1', certName: 'CompTIA A+' });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(table.rows.get('cert_1')!.status).toBe('approved');
  });

  it('an approve racing a reject cannot overwrite the first decision', async () => {
    const table = fakeTable(pendingRow());
    table.alignReads(2);

    const rejectRes = await Promise.all([
      review(reviewRequest({ certId: 'cert_1', action: 'reject' }) as never),
      review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never),
    ]);
    await flushAfter();

    const winner = rejectRes.find((r) => r.status === 200);
    const loser = rejectRes.find((r) => r.status === 409);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();

    const decided = table.rows.get('cert_1')!.status;
    const winnerBody = await winner!.json();
    expect(winnerBody).toMatchObject({ success: true, certification: { id: 'cert_1', status: decided } });
    expect(await loser!.json()).toEqual({ error: 'Certification was already reviewed', status: decided });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: `admin_certification_${decided}` }));
    expect(runCertificationApprovedEffects).toHaveBeenCalledTimes(decided === 'approved' ? 1 : 0);
  });

  it('the loser of the write (count 0, re-read shows approved) gets 409, schedules no effects and writes no audit', async () => {
    vi.mocked(prisma.userCertification.findFirst)
      .mockResolvedValueOnce({ id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: null } as never)
      .mockResolvedValueOnce({ id: 'cert_1', status: 'approved' } as never);
    vi.mocked(prisma.userCertification.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.userCertification.update).mockResolvedValue({ id: 'cert_1', status: 'approved' } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Certification was already reviewed', status: 'approved' });
    expect(afterCallbacks).toHaveLength(0);
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('a row that disappears between the read and the write returns 404 with no effects or audit', async () => {
    vi.mocked(prisma.userCertification.findFirst)
      .mockResolvedValueOnce({ id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: null } as never)
      .mockResolvedValueOnce(null as never);
    vi.mocked(prisma.userCertification.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.userCertification.update).mockRejectedValue(new Error('Record to update not found'));

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(404);
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('the winning first approval schedules the effects exactly once and returns the reviewed row', async () => {
    const table = fakeTable(pendingRow());

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    expect(afterCallbacks).toHaveLength(1);
    await flushAfter();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      certification: { id: 'cert_1', status: 'approved', reviewedAt: expect.any(String), reviewedById: 'admin_1' },
    });
    expect(runCertificationApprovedEffects).toHaveBeenCalledTimes(1);
    expect(table.rows.get('cert_1')).toMatchObject({ status: 'approved', reviewedById: 'admin_1' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_certification_approved',
      targetId: 'cert_1',
      metadata: expect.objectContaining({ previousStatus: 'pending', status: 'approved' }),
    }));
  });

  it('a re-approval after a proof upload (reviewedAt already set) schedules no effects', async () => {
    const table = fakeTable(pendingRow({ reviewedAt: new Date('2026-09-01T00:00:00Z'), reviewedById: 'admin_0' }));

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(table.rows.get('cert_1')).toMatchObject({ status: 'approved', reviewedById: 'admin_1' });
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('a stale first-approval read cannot fire the effects after another admin already reviewed the row and it returned to pending', async () => {
    // Admin 2 read the row as never-reviewed; meanwhile admin 1 approved it and
    // the member uploaded a new proof, moving it back to pending with a
    // reviewedAt. Admin 2's write must not count as a first approval.
    const table = fakeTable(pendingRow());
    vi.mocked(prisma.userCertification.findFirst).mockImplementationOnce((async () => {
      const snapshot = { id: 'cert_1', status: 'pending', userId: 'member_1', certName: 'CompTIA A+', reviewedAt: null };
      Object.assign(table.rows.get('cert_1')!, { status: 'pending', reviewedAt: new Date('2026-09-02T00:00:00Z'), reviewedById: 'admin_1' });
      return snapshot;
    }) as never);
    vi.mocked(getUser).mockResolvedValue({ id: 'admin_2' } as never);

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(409);
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
    expect(table.rows.get('cert_1')!.reviewedById).toBe('admin_1');
  });

  it('scopes the conditional write to the pending row in the actor org', async () => {
    fakeTable(pendingRow());

    await review(reviewRequest({ certId: 'cert_1', action: 'reject' }) as never);

    expect(prisma.userCertification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'cert_1', status: 'pending', user: { organizationId: 'org_1' } }),
      data: expect.objectContaining({ status: 'rejected', reviewedById: 'admin_1', reviewedAt: expect.any(Date) }),
    }));
  });
});

describe('admin certification review access still holds', () => {
  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    expect(res.status).toBe(401);
    expect(prisma.userCertification.findFirst).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    expect(res.status).toBe(403);
    expect(prisma.userCertification.findFirst).not.toHaveBeenCalled();
  });

  it('404 for a certificate in another org, with no write, effects or audit', async () => {
    const table = fakeTable(pendingRow({ orgId: 'org_2' }));

    const res = await review(reviewRequest({ certId: 'cert_1', action: 'approve' }) as never);
    await flushAfter();

    expect(res.status).toBe(404);
    expect(table.rows.get('cert_1')!.status).toBe('pending');
    expect(runCertificationApprovedEffects).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});
