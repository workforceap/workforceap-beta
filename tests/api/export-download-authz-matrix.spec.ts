/**
 * S01/S03 negative-authorization matrix for PII export and signed-URL routes.
 *
 * Each route below is imported as the real handler. Only the identity edge
 * (getUser), the role helpers, Prisma, withTenantScope and the Supabase admin
 * client are replaced, and the fakes answer from one identity table so the
 * denials come from the route's own checks rather than from a stubbed
 * "false". Every route also has an allowed-caller control, so a denial cannot
 * pass just because the mocks broke the handler.
 *
 * Routes and the denial each one pins:
 *  - GET /api/employer/jobs/[id]/applications/export: 401 signed out, 403 for
 *    non-employers, 404 for another employer's job with no applicant read and
 *    no audit write.
 *  - GET /api/admin/members/[id]/resume-urls: 401, 403 for non-admins, 404 for
 *    another org's member and 409 for a stored path the member does not own,
 *    never minting a signed URL in any of them.
 *  - GET /api/admin/export/eligibility: 401, 403 for non-admins, and the read
 *    runs under withTenantScope with the actor's own org.
 *  - GET /api/admin/employers/export: 401, 403 for non-admins, and 403 for an
 *    admin whose org is not the org resolved from the request.
 *  - GET /api/admin/partners/export: 401, 403 for non-admins, and the reads
 *    run under withTenantScope with the actor's own org.
 *  - GET /api/admin/crons/export: signed-out and non-admin callers are denied
 *    before any cron row is read. Whether tenant admins may read it is not
 *    decided, so tenant-admin denial is deliberately not asserted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Identity = {
  role: 'member' | 'counselor' | 'employer' | 'admin' | 'super_admin';
  orgId: string;
  employerId?: string;
};

const fx = vi.hoisted(() => {
  const identities: Record<string, Identity> = {
    'admin-a': { role: 'admin', orgId: 'org-a' },
    'admin-b': { role: 'admin', orgId: 'org-b' },
    'member-a': { role: 'member', orgId: 'org-a' },
    'counselor-a': { role: 'counselor', orgId: 'org-a' },
    'employer-a': { role: 'employer', orgId: 'org-a', employerId: 'emp-a' },
  };
  const members: Record<string, { orgId: string; resumeOriginalPath: string | null; resumeEnhancedPath: string | null }> = {
    'member-a': {
      orgId: 'org-a',
      resumeOriginalPath: 'member-a/resume-original.pdf',
      resumeEnhancedPath: 'member-a/resume-enhanced.txt',
    },
    'member-b': {
      orgId: 'org-b',
      resumeOriginalPath: 'member-b/resume-original.pdf',
      resumeEnhancedPath: null,
    },
    // Same org as admin-a, but the stored pointer names another member's object.
    'member-a-foreign-path': {
      orgId: 'org-a',
      resumeOriginalPath: 'member-b/resume-original.pdf',
      resumeEnhancedPath: null,
    },
  };
  const jobs: Record<string, { employerId: string; title: string }> = {
    'job-a': { employerId: 'emp-a', title: 'Help Desk Analyst' },
    'job-b': { employerId: 'emp-b', title: 'Network Technician' },
  };
  return { identities, members, jobs };
});

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(), resolveAuthGucContext: vi.fn() }));

vi.mock('@/lib/auth/roles', async () => {
  const { hasAdminAccess, hasSuperAdminAccess } = await import('@/lib/auth/roleAccess');
  const roleOf = (userId: string) => fx.identities[userId]?.role ?? 'member';
  const isSuperAdmin = vi.fn(async (userId: string) => hasSuperAdminAccess(roleOf(userId), []));
  const isAdmin = vi.fn(async (userId: string) => hasAdminAccess(roleOf(userId), []));
  return {
    isSuperAdmin,
    isAdmin,
    // Mirrors lib/auth/roles.ts isAdminInOrg: super_admin is cross-tenant,
    // everyone else must be an admin whose User.organizationId is orgId.
    isAdminInOrg: vi.fn(async (userId: string, orgId: string) => {
      if (await isSuperAdmin(userId)) return true;
      if (!(await isAdmin(userId))) return false;
      return fx.identities[userId]?.orgId === orgId;
    }),
    getEmployerForUser: vi.fn(async (userId: string) => {
      const identity = fx.identities[userId];
      if (!identity?.employerId) return null;
      return {
        employerId: identity.employerId,
        employer: {
          id: identity.employerId,
          companyName: 'Example Co',
          contactEmail: 'hiring@example.com',
          tier: 'standard',
          logoUrl: null,
          status: 'active',
        },
      };
    }),
  };
});

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    user: {
      // getActorOrganizationId reads the actor's own User row.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const identity = fx.identities[where.id];
        return identity ? { organizationId: identity.orgId } : null;
      }),
      // resume-urls resolves the subject member inside the actor's org.
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId?: string } }) => {
        const member = fx.members[where.id];
        if (!member) return null;
        if (where.organizationId !== undefined && where.organizationId !== member.orgId) return null;
        return { id: where.id };
      }),
    },
    profile: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const member = fx.members[where.userId];
        return member
          ? { userId: where.userId, resumeOriginalPath: member.resumeOriginalPath, resumeEnhancedPath: member.resumeEnhancedPath }
          : null;
      }),
    },
    job: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; employerId?: string } }) => {
        const job = fx.jobs[where.id];
        if (!job) return null;
        if (where.employerId !== undefined && where.employerId !== job.employerId) return null;
        return { id: where.id, title: job.title };
      }),
    },
    jobPostingApplication: {
      findMany: vi.fn(async () => [
        {
          studentId: 'member-a',
          status: 'submitted',
          appliedAt: new Date('2026-09-01T00:00:00Z'),
          resumeUrl: null,
          student: { id: 'member-a', fullName: 'Pat Example', email: 'pat@example.com' },
        },
      ]),
    },
    aIJobMatch: { findMany: vi.fn(async () => []) },
    cronExecution: { findMany: vi.fn(async () => []) },
    organization: { findUnique: vi.fn(async () => ({ id: 'org-a' })) },
  };
  return { prisma };
});

vi.mock('@/lib/tenant/withTenantScope', () => {
  const scopedDb = {
    user: { findMany: vi.fn(async () => []) },
    employer: { findMany: vi.fn(async () => []) },
    partner: { findMany: vi.fn(async () => []) },
    subgroup: { findMany: vi.fn(async () => []) },
  };
  return {
    scopedDb,
    withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
      if (!orgId) throw new Error('[tenant-scope] orgId required');
      return fn(scopedDb);
    }),
    crossTenantOK: vi.fn((fn: () => unknown) => fn()),
  };
});

vi.mock('@/lib/supabase-admin', () => {
  const createSignedUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://storage.example.test/signed/${path}` },
    error: null,
  }));
  const download = vi.fn(async () => ({
    data: { arrayBuffer: async () => new TextEncoder().encode('Synthetic member resume with verified inventory and logistics experience.').buffer },
    error: null,
  }));
  return {
    createSignedUrl,
    download,
    getSupabaseAdmin: vi.fn(() => ({ storage: { from: vi.fn(() => ({ createSignedUrl, download })) } })),
  };
});

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));

const { GET: applicantExportGET } = await import('@/app/api/employer/jobs/[id]/applications/export/route');
const { GET: resumeUrlsGET } = await import('@/app/api/admin/members/[id]/resume-urls/route');
const { GET: eligibilityExportGET } = await import('@/app/api/admin/export/eligibility/route');
const { GET: employersExportGET } = await import('@/app/api/admin/employers/export/route');
const { GET: partnersExportGET } = await import('@/app/api/admin/partners/export/route');
const { GET: cronsExportGET } = await import('@/app/api/admin/crons/export/route');

const { getUser } = await import('@/lib/auth/server');
const { prisma } = await import('@/lib/db/prisma');
const tenantScope = (await import('@/lib/tenant/withTenantScope')) as unknown as {
  withTenantScope: ReturnType<typeof vi.fn>;
  scopedDb: Record<'user' | 'employer' | 'partner' | 'subgroup', { findMany: ReturnType<typeof vi.fn> }>;
};
const { createSignedUrl, download } = (await import('@/lib/supabase-admin')) as unknown as {
  createSignedUrl: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
};
const { auditLog } = await import('@/lib/audit');
const { logAuditEvent } = await import('@/lib/audit/log');

function signInAs(userId: string | null) {
  vi.mocked(getUser).mockResolvedValue(userId ? ({ id: userId } as never) : null);
}

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers }) as never;
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const NON_ADMIN_CALLERS = ['member-a', 'counselor-a', 'employer-a'] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/employer/jobs/[id]/applications/export', () => {
  const call = (jobId: string) =>
    applicantExportGET(req(`http://localhost/api/employer/jobs/${jobId}/applications/export`), idParams(jobId));

  it('returns 401 when signed out', async () => {
    signInAs(null);
    expect((await call('job-a')).status).toBe(401);
    expect(prisma.jobPostingApplication.findMany).not.toHaveBeenCalled();
  });

  it.each(['member-a', 'counselor-a', 'admin-a'])('returns 403 for non-employer caller %s', async (userId) => {
    signInAs(userId);
    expect((await call('job-a')).status).toBe(403);
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
    expect(prisma.jobPostingApplication.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for another employer\'s job without reading applicants or writing audit rows', async () => {
    signInAs('employer-a');
    const response = await call('job-b');
    expect(response.status).toBe(404);
    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-b', employerId: 'emp-a' } }),
    );
    expect(prisma.jobPostingApplication.findMany).not.toHaveBeenCalled();
    expect(prisma.aIJobMatch.findMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('control: the owning employer gets the CSV', async () => {
    signInAs('employer-a');
    const response = await call('job-a');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(prisma.jobPostingApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'job-a' } }),
    );
  });
});

describe('GET /api/admin/members/[id]/resume-urls', () => {
  const call = (memberId: string) =>
    resumeUrlsGET(new Request(`http://localhost/api/admin/members/${memberId}/resume-urls`), idParams(memberId));

  it('returns 401 when signed out', async () => {
    signInAs(null);
    expect((await call('member-a')).status).toBe(401);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_CALLERS)('returns 403 for non-admin caller %s', async (userId) => {
    signInAs(userId);
    expect((await call('member-a')).status).toBe(403);
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 for a member in another org and never mints a signed URL', async () => {
    signInAs('admin-a');
    const response = await call('member-b');
    expect(response.status).toBe(404);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'member-b', organizationId: 'org-a' } }),
    );
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 409 when the stored resume path is not owned by the member', async () => {
    signInAs('admin-a');
    const response = await call('member-a-foreign-path');
    expect(response.status).toBe(409);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('control: a same-org admin gets signed URLs for the member\'s own objects', async () => {
    signInAs('admin-a');
    const response = await call('member-a');
    expect(response.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUrl).toHaveBeenCalledWith('member-a/resume-original.pdf', 3600);
    expect(createSignedUrl).toHaveBeenCalledWith('member-a/resume-enhanced.txt', 3600);
  });

  it('does not sign a legacy enhanced draft containing an extraction failure narrative', async () => {
    signInAs('admin-a');
    const failedDraft = 'Given the provided information, the "base resume to improve" is a raw PDF stream that cannot be parsed for text content. The enhanced resume will use contact information only.';
    download.mockResolvedValueOnce({
      data: { arrayBuffer: async () => new TextEncoder().encode(failedDraft).buffer },
      error: null,
    });

    const response = await call('member-a');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      hasOriginal: true,
      hasEnhanced: false,
      enhancedUnavailable: true,
      enhancedUrl: null,
      enhancedPath: null,
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith('member-a/resume-original.pdf', 3600);
  });
});

describe('GET /api/admin/export/eligibility', () => {
  it('returns 401 when signed out', async () => {
    signInAs(null);
    expect((await eligibilityExportGET(req('http://localhost/api/admin/export/eligibility'))).status).toBe(401);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_CALLERS)('returns 403 for non-admin caller %s', async (userId) => {
    signInAs(userId);
    expect((await eligibilityExportGET(req('http://localhost/api/admin/export/eligibility'))).status).toBe(403);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
    expect(tenantScope.scopedDb.user.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['admin-a', 'org-a'],
    ['admin-b', 'org-b'],
  ])('scopes the member read for %s to the actor org %s', async (userId, orgId) => {
    signInAs(userId);
    const response = await eligibilityExportGET(req('http://localhost/api/admin/export/eligibility'));
    expect(response.status).toBe(200);
    expect(tenantScope.withTenantScope).toHaveBeenCalledTimes(1);
    expect(tenantScope.withTenantScope).toHaveBeenCalledWith(orgId, expect.any(Function));
    expect(tenantScope.scopedDb.user.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/employers/export', () => {
  const call = (orgHeader: string) =>
    employersExportGET(
      req('http://localhost/api/admin/employers/export', { 'x-wap-org-id': orgHeader, 'x-wap-host': 'tenant.example.test' }),
    );

  it('returns 401 when signed out', async () => {
    signInAs(null);
    expect((await call('org-a')).status).toBe(401);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_CALLERS)('returns 403 for non-admin caller %s', async (userId) => {
    signInAs(userId);
    expect((await call('org-a')).status).toBe(403);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
  });

  it('returns 403 for an admin of a different org than the one resolved from the request', async () => {
    signInAs('admin-a');
    expect((await call('org-b')).status).toBe(403);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
    expect(tenantScope.scopedDb.employer.findMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('control: an admin of the resolved org gets the CSV scoped to that org', async () => {
    signInAs('admin-b');
    const response = await call('org-b');
    expect(response.status).toBe(200);
    expect(tenantScope.withTenantScope).toHaveBeenCalledWith('org-b', expect.any(Function));
  });
});

describe('GET /api/admin/partners/export', () => {
  const call = () => partnersExportGET(req('http://localhost/api/admin/partners/export'));

  it('returns 401 when signed out', async () => {
    signInAs(null);
    expect((await call()).status).toBe(401);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_CALLERS)('returns 403 for non-admin caller %s', async (userId) => {
    signInAs(userId);
    expect((await call()).status).toBe(403);
    expect(tenantScope.withTenantScope).not.toHaveBeenCalled();
    expect(tenantScope.scopedDb.partner.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['admin-a', 'org-a'],
    ['admin-b', 'org-b'],
  ])('scopes every partner read for %s to the actor org %s', async (userId, orgId) => {
    signInAs(userId);
    const response = await call();
    expect(response.status).toBe(200);
    // Partners and their subgroups are two scoped reads; both use the actor org.
    expect(tenantScope.withTenantScope).toHaveBeenCalledTimes(2);
    for (const [scopeOrg] of tenantScope.withTenantScope.mock.calls) {
      expect(scopeOrg).toBe(orgId);
    }
  });
});

describe('GET /api/admin/crons/export', () => {
  const call = () => cronsExportGET(req('http://localhost/api/admin/crons/export'));

  it('denies a signed-out caller before reading cron rows', async () => {
    signInAs(null);
    expect((await call()).status).toBe(401);
    expect(prisma.cronExecution.findMany).not.toHaveBeenCalled();
  });

  // The route currently answers non-admins with 401 rather than 403. Either
  // code is a denial; the pin is that no cron row is read.
  it.each(NON_ADMIN_CALLERS)('denies non-admin caller %s before reading cron rows', async (userId) => {
    signInAs(userId);
    expect([401, 403]).toContain((await call()).status);
    expect(prisma.cronExecution.findMany).not.toHaveBeenCalled();
  });

  it('control: an admin gets the CSV', async () => {
    signInAs('admin-a');
    expect((await call()).status).toBe(200);
    expect(prisma.cronExecution.findMany).toHaveBeenCalledTimes(1);
  });
});
