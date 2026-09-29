import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getOrg: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json' },
      }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getOrg }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({ user: { findMany: mocks.findMany } }),
  },
}));

import { GET } from '@/app/api/admin/lifecycle/drift/route';

type Row = {
  id: string;
  fullName: string | null;
  email: string;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  courseEnrollments: Array<{ programSlug: string; enrolledAt: Date }>;
};

function row(id: string, enrolledProgram: string | null, primary: string | null): Row {
  return {
    id,
    fullName: `Member ${id}`,
    email: `${id}@example.test`,
    enrolledProgram,
    enrolledAt: null,
    courseEnrollments: primary ? [{ programSlug: primary, enrolledAt: new Date('2026-09-01T00:00:00Z') }] : [],
  };
}

async function callGet() {
  const res = await (GET as unknown as () => Promise<Response>)();
  return { status: res.status, body: await res.json() };
}

describe('GET /api/admin/lifecycle/drift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-1' });
    mocks.isAdmin.mockResolvedValue(true);
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.getOrg.mockResolvedValue('org-1');
    mocks.findMany.mockResolvedValue([]);
  });

  it('scans members with a primary enrollment row even when the legacy pointer is NULL', async () => {
    await callGet();
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where.deletedAt).toBeNull();
    expect(where.enrolledProgram).toBeUndefined();
    expect(where.OR).toEqual([
      { enrolledProgram: { not: null } },
      { courseEnrollments: { some: { isPrimary: true } } },
    ]);
  });

  it('classifies pointer_missing, alias_equivalent, slug_mismatch and enrolled_no_record', async () => {
    mocks.findMany.mockResolvedValue([
      row('in-sync', 'it-support-professional-certificate-google', 'it-support-professional-certificate-google'),
      row('null-pointer', null, 'it-support-professional-certificate-google'),
      row('alias', 'comptia-a-plus', 'comptia-a-professional-certificate'),
      row('mismatch', 'cybersecurity-professional-certificate-google', 'it-support-professional-certificate-google'),
      row('no-record', 'it-support-professional-certificate-google', null),
    ]);

    const { status, body } = await callGet();

    expect(status).toBe(200);
    const byUser = Object.fromEntries(
      body.records.map((r: { userId: string; driftType: string }) => [r.userId, r.driftType]),
    );
    expect(byUser).toEqual({
      'null-pointer': 'pointer_missing',
      alias: 'alias_equivalent',
      mismatch: 'slug_mismatch',
      'no-record': 'enrolled_no_record',
    });
    expect(body.total).toBe(4);
    expect(body.scanned).toBe(5);
    expect(body.counts).toEqual({
      enrolled_no_record: 1,
      pointer_missing: 1,
      slug_mismatch: 1,
      alias_equivalent: 1,
    });
    const nullPointer = body.records.find((r: { userId: string }) => r.userId === 'null-pointer');
    expect(nullPointer).toMatchObject({
      userProgram: null,
      enrollmentProgram: 'it-support-professional-certificate-google',
    });
  });

  it('returns the same response shape when the actor has no organization', async () => {
    mocks.getOrg.mockRejectedValue(new Error('no org'));

    const { status, body } = await callGet();

    expect(status).toBe(200);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      total: 0,
      records: [],
      scanned: 0,
      counts: { enrolled_no_record: 0, pointer_missing: 0, slug_mismatch: 0, alias_equivalent: 0 },
    });
    expect(typeof body.checkedAt).toBe('string');
    expect(body).not.toHaveProperty('drift');
  });

  it('super admins scan without an organization filter', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    await callGet();
    expect(mocks.getOrg).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0].where).not.toHaveProperty('organizationId');
  });

  it('rejects non-admins', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const { status } = await callGet();
    expect(status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
