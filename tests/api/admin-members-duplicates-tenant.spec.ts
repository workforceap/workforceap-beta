import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/admin/members/duplicates is a PII merge tool. Auth and the
 * actor-org SQL fragment must hold before any user row is read: dropping
 * `organization_id` would list another tenant's duplicate emails.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  queryRaw: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: mocks.requireAdmin,
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    user: { findMany: mocks.findMany },
  };
  return {
    prisma: {
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { GET } from '@/app/api/admin/members/duplicates/route';

const ORG = 'org-a';
const MEMBER_A = {
  id: 'member-a',
  fullName: 'Pat Jones',
  email: 'pat@example.test',
  phone: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  enrolledProgram: null,
  assessmentCompleted: false,
  memberProgramProgress: [],
  courseProgress: [],
  profile: null,
  _count: {
    applications: 0,
    learningProgress: 0,
    userCertifications: 0,
    memberEvents: 0,
    weeklyRecaps: 0,
    counselorAssignments: 0,
    aiToolResults: 0,
    goals: 0,
    jobApplications: 0,
    messagesAuthored: 0,
    partnerReferrals: 0,
  },
};

function sqlText(arg: unknown): string {
  if (arg == null) return '';
  if (typeof arg === 'string') return arg;
  if (Array.isArray(arg) && arg.every((part) => typeof part === 'string')) {
    return arg.join('');
  }
  if (typeof arg === 'object') {
    const rec = arg as { strings?: unknown; values?: unknown; sql?: unknown; text?: unknown };
    if (typeof rec.text === 'string' && rec.text.includes('organization_id')) return rec.text;
    if (typeof rec.sql === 'string' && rec.sql.includes('organization_id')) return rec.sql;
    const chunks: string[] = [];
    if (Array.isArray(rec.strings)) {
      const values = Array.isArray(rec.values) ? rec.values : [];
      rec.strings.forEach((part, index) => {
        chunks.push(String(part));
        if (index < values.length) chunks.push(sqlText(values[index]));
      });
      return chunks.join('');
    }
    if (Array.isArray(rec.values)) return rec.values.map(sqlText).join('');
  }
  return String(arg);
}

function taggedSql(call: unknown[]): { text: string; values: unknown[] } {
  const [strings, ...values] = call;
  const text = Array.isArray(strings)
    ? strings.reduce((acc: string, part: unknown, index: number) => (
      acc + String(part) + (index < values.length ? sqlText(values[index]) : '')
    ), '')
    : sqlText(strings);
  const nested = values.flatMap((value) => {
    if (value && typeof value === 'object' && 'values' in value && Array.isArray((value as { values: unknown[] }).values)) {
      return (value as { values: unknown[] }).values;
    }
    return [value];
  });
  return { text, values: nested };
}

async function run() {
  return GET(new NextRequest('http://localhost/api/admin/members/duplicates'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.queryRaw.mockResolvedValue([{ email: 'pat@example.test', ids: [MEMBER_A.id] }]);
  mocks.findMany.mockResolvedValue([MEMBER_A]);
});

describe('GET /api/admin/members/duplicates', () => {
  it('returns 401 before querying when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(401);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before querying when the caller is not admin', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await run();
    expect(res.status).toBe(403);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('filters the duplicate-email SQL and the follow-up read to the actor org', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    const body = await res.json() as { groups: Array<{ canonicalEmail: string }>; totalGroups: number };
    expect(body.totalGroups).toBe(1);
    expect(body.groups[0]?.canonicalEmail).toBe('pat@example.test');

    const sql = taggedSql(mocks.queryRaw.mock.calls[0]);
    expect(sql.text).toMatch(/organization_id/i);
    expect(sql.values).toContain(ORG);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [MEMBER_A.id] }, organizationId: ORG },
      take: 100,
    }));
  });

  it('omits organization_id for a super-admin', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    const sql = taggedSql(mocks.queryRaw.mock.calls[0]);
    expect(sql.text).not.toMatch(/organization_id/i);
    expect(sql.values).not.toContain(ORG);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [MEMBER_A.id] } },
    }));
    expect(mocks.findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
  });

  it('answers 500 when the duplicate query throws', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('db down'));
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
