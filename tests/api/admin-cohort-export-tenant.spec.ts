import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';

/**
 * GET /api/admin/cohort-export is a WIOA/funder CSV. Auth, tenant scope and
 * MEMBER_ONLY_WHERE must hold before any user row is read: a missing program
 * filter, a staff-inclusive where, or an unscoped list would leak PII across
 * tenants and into grant reports.
 */
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new globalThis.URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: class MockNextResponse extends Response {
      static json(body: unknown, init?: ResponseInit) {
        return new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        });
      }
    },
  };
});

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: { user: { findMany: typeof mocks.findMany } }) => unknown) =>
      fn({ user: { findMany: mocks.findMany } }),
    user: { findMany: mocks.findMany },
  },
}));

import { GET as exportCohort } from '@/app/api/admin/cohort-export/route';

const ORG = 'org-a';
const SLUG = 'data-analytics-professional-certificate-google';
const URL = `http://localhost/api/admin/cohort-export?program=${encodeURIComponent(SLUG)}`;

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    fullName: 'Pat Jones',
    email: 'pat@example.test',
    enrolledAt: new Date('2026-01-05T00:00:00.000Z'),
    assessmentCompleted: true,
    assessmentScorePct: 92,
    courseEnrollments: [{ programSlug: SLUG, curriculumVersion: LEGACY_CURRICULUM_VERSION, enrolledAt: new Date('2026-01-05T00:00:00.000Z') }],
    memberProgramProgress: [{ programSlug: SLUG, coursesCompleted: 2 }],
    courseProgress: [{ courseSlug: 'foundations' }],
    profile: { employmentStatus: 'unemployed' },
    preScreeningResponse: { employmentStatus: 'unemployed', barrier: 'transportation' },
    placementRecord: {
      employerName: 'Acme',
      jobTitle: 'Analyst',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      salaryOffered: 52000,
      wageAtFollowUp: 54000,
      retentionStatus: 'retained',
      placedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

async function run(url = URL) {
  return exportCohort(new NextRequest(url) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.findMany.mockResolvedValue([memberRow()]);
});

describe('GET /api/admin/cohort-export', () => {
  it('returns 401 before listing when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 400 when program is missing, without querying members', async () => {
    const res = await run('http://localhost/api/admin/cohort-export');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('program') });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown program slug, without querying members', async () => {
    const res = await run('http://localhost/api/admin/cohort-export?program=not-a-real-program');
    expect(res.status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('lists members in the actor org with MEMBER_ONLY_WHERE and the 10_000 take cap', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(/cohort-data-analytics-professional-certificate-google-\d{4}-\d{2}-\d{2}\.csv/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const where = mocks.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toMatchObject({
      deletedAt: null,
      organizationId: ORG,
      ...MEMBER_ONLY_WHERE,
    });
    expect(where).not.toMatchObject(MEMBER_OR_DOGFOOD_WHERE);
    expect(mocks.findMany.mock.calls[0][0].take).toBe(10_000);

    const csv = await res.text();
    expect(csv).toContain('Pat Jones');
    expect(csv).toContain('pat@example.test');
    expect(csv).toContain('Member Name');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin-a',
      action: 'admin.export.cohort',
      metadata: expect.objectContaining({ orgId: ORG, programSlug: SLUG, rowCount: 1 }),
    }));
  });

  it('omits organizationId for a super-admin and still applies MEMBER_ONLY_WHERE', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    const res = await run();
    expect(res.status).toBe(200);
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    const where = mocks.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.organizationId).toBeUndefined();
    expect(where).toMatchObject(MEMBER_ONLY_WHERE);
  });

  it('neutralises a formula-prefixed member name in the CSV body', async () => {
    mocks.findMany.mockResolvedValue([memberRow({ fullName: '=HYPERLINK("http://evil.test","x")' })]);
    const res = await run();
    const csv = await res.text();
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).not.toMatch(/(?:^|,)=HYPERLINK/m);
  });

  it('answers 500 Export failed when the member query throws', async () => {
    mocks.findMany.mockRejectedValue(new Error('db down'));
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Export failed' });
  });
});
