import { beforeEach, describe, expect, it, vi } from 'vitest';

type Identity = { organizationId: string; role: string; counselorActive?: boolean };
const fx = vi.hoisted(() => ({
  actor: null as string | null,
  identities: {
    'member-a': { organizationId: 'org-a', role: 'member' },
    'member-b': { organizationId: 'org-b', role: 'member' },
    'applicant-a': { organizationId: 'org-a', role: 'applicant' },
    'partner-a': { organizationId: 'org-a', role: 'partner' },
    'employer-a': { organizationId: 'org-a', role: 'employer' },
    'admin-a': { organizationId: 'org-a', role: 'admin' },
    'admin-b': { organizationId: 'org-b', role: 'admin' },
    'support-a': { organizationId: 'org-a', role: 'super_admin' },
    'assigned-a': { organizationId: 'org-a', role: 'counselor', counselorActive: true },
    'unassigned-a': { organizationId: 'org-a', role: 'counselor', counselorActive: true },
    'inactive-a': { organizationId: 'org-a', role: 'counselor', counselorActive: false },
  } as Record<string, Identity>,
  assignmentActive: true,
  exportData: vi.fn(async (id: string) => ({ member: { id } })),
  retake: vi.fn(async () => ({ ok: true, previousScorePct: 80 })),
  sign: vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/synthetic-resume' }, error: null })),
  download: vi.fn(),
  profileRead: vi.fn(async () => ({ resumeOriginalPath: 'member-a/resume-original.pdf', resumeEnhancedPath: null })),
  audit: vi.fn(async () => undefined),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      ...init, headers: { 'content-type': 'application/json', ...init?.headers },
    }),
  },
}));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => fx.actor ? { id: fx.actor } : null }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/member/exportData', () => ({ buildMemberExport: fx.exportData }));
vi.mock('@/lib/assessment/retake', () => ({ allowAssessmentRetake: fx.retake }));
vi.mock('@/lib/audit', () => ({ auditLog: fx.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: fx.audit, auditRequestMeta: () => ({ ip: null, ua: null }) }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: fx.sign, download: fx.download }) } }),
}));
vi.mock('@/lib/db/prisma', () => {
  const record = (id: string) => {
    const identity = fx.identities[id];
    return identity ? {
      id, organizationId: identity.organizationId, deletedAt: null,
      profile: { role: identity.role }, userRoles: [{ role: { name: identity.role } }],
    } : null;
  };
  const prisma = {
    $transaction: async (fn: (db: unknown) => unknown) => fn(prisma),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => record(where.id),
      findFirst: async ({ where }: { where: { id: string; organizationId?: string } }) => {
        const row = record(where.id);
        return row && (where.organizationId === undefined || where.organizationId === row.organizationId) ? row : null;
      },
    },
    counselor: {
      findFirst: async ({ where }: { where: { userId: string; active?: boolean } }) => {
        const identity = fx.identities[where.userId];
        return identity?.counselorActive ? { id: `counselor-${where.userId}` } : null;
      },
    },
    counselorAssignment: {
      findFirst: async ({ where }: { where: { memberId: string; active?: boolean; counselor: { userId: string; active?: boolean } } }) => {
        const identity = fx.identities[where.counselor.userId];
        return where.memberId === 'member-a' && where.counselor.userId === 'assigned-a'
          && (!where.active || fx.assignmentActive) && (!where.counselor.active || identity?.counselorActive)
          ? { id: 'assignment-a' } : null;
      },
    },
    profile: { findUnique: fx.profileRead },
  };
  return { prisma };
});

// These imports use the real persisted-role guards and member-assignment helper.
// Only Auth, database records, and external/export side effects are synthetic.
import { GET as staffExport } from '@/app/api/admin/members/[id]/export-data/route';
import { POST as adminResetAssessment } from '@/app/api/admin/members/[id]/reset-assessment/route';
import { GET as selfExport } from '@/app/api/member/export-data/route';
import { POST as assessmentRetake } from '@/app/api/counselor/assessment-retake/route';
import { GET as counselorResume } from '@/app/api/counselor/members/[memberId]/resume/route';

const staffRequest = (member = 'member-a') => new Request(`https://example.test/api/admin/members/${member}/export-data`) as never;
const staffParams = (member = 'member-a') => ({ params: Promise.resolve({ id: member }) });

beforeEach(() => {
  vi.clearAllMocks();
  fx.actor = null;
  fx.assignmentActive = true;
});

describe('comprehensive staff export uses member authorization before building data', () => {
  it('denies an anonymous caller before reading export data', async () => {
    expect((await staffExport(staffRequest(), staffParams())).status).toBe(401);
    expect(fx.exportData).not.toHaveBeenCalled();
  });

  it.each(['member-a', 'applicant-a', 'partner-a', 'employer-a', 'inactive-a'])('denies %s through the direct endpoint', async (actor) => {
    fx.actor = actor;
    expect((await staffExport(staffRequest(), staffParams())).status).toBe(403);
    expect(fx.exportData).not.toHaveBeenCalled();
    expect(fx.audit).not.toHaveBeenCalled();
  });

  it('denies an active counselor who is not assigned to the member', async () => {
    fx.actor = 'unassigned-a';
    expect((await staffExport(staffRequest(), staffParams())).status).toBe(403);
    expect(fx.exportData).not.toHaveBeenCalled();
    expect(fx.audit).not.toHaveBeenCalled();
  });

  it('denies a counselor whose assignment is no longer active', async () => {
    fx.actor = 'assigned-a';
    fx.assignmentActive = false;
    expect((await staffExport(staffRequest(), staffParams())).status).toBe(403);
    expect(fx.exportData).not.toHaveBeenCalled();
    expect(fx.audit).not.toHaveBeenCalled();
  });

  it.each(['assigned-a', 'admin-a', 'support-a'])('allows the existing authorized %s export', async (actor) => {
    fx.actor = actor;
    const response = await staffExport(staffRequest(), staffParams());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ member: { id: 'member-a' } });
    expect(fx.exportData).toHaveBeenCalledExactlyOnceWith('member-a');
    expect(fx.audit).toHaveBeenCalled();
  });

  it.each(['assigned-a', 'admin-a', 'support-a'])('preserves the actor-org export boundary for %s', async (actor) => {
    fx.actor = actor;
    expect((await staffExport(staffRequest('member-b'), staffParams('member-b'))).status).toBe(404);
    expect(fx.exportData).not.toHaveBeenCalled();
  });

  it('allows a tenant admin to export its own tenant member', async () => {
    fx.actor = 'admin-b';
    expect((await staffExport(staffRequest('member-b'), staffParams('member-b'))).status).toBe(200);
    expect(fx.exportData).toHaveBeenCalledExactlyOnceWith('member-b');
  });
});

describe('member self export ignores caller-supplied subject IDs', () => {
  it('exports only the authenticated user even when the query names another member', async () => {
    fx.actor = 'member-a';
    const response = await selfExport(new Request('https://example.test/api/member/export-data?userId=member-b') as never);
    expect(response.status).toBe(200);
    expect(fx.exportData).toHaveBeenCalledExactlyOnceWith('member-a');
  });
});

describe('admin assessment reset stays inside the actor tenant', () => {
  const resetRequest = (member: string) => new Request(`https://example.test/api/admin/members/${member}/reset-assessment`, {
    method: 'POST',
  });
  const resetParams = (member: string) => ({ params: Promise.resolve({ id: member }) });

  it('denies an Org A admin before clearing an Org B member\'s official preassessment', async () => {
    fx.actor = 'admin-a';
    const response = await adminResetAssessment(resetRequest('member-b'), resetParams('member-b'));
    expect(response.status).toBe(404);
    expect(fx.retake).not.toHaveBeenCalled();
    expect(fx.audit).not.toHaveBeenCalled();
  });

  it('allows a tenant admin to reset a member in the same organization', async () => {
    fx.actor = 'admin-a';
    const response = await adminResetAssessment(resetRequest('member-a'), resetParams('member-a'));
    expect(response.status).toBe(200);
    expect(fx.retake).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      staffUserId: 'admin-a',
      staffRole: 'admin',
    });
    expect(fx.audit).toHaveBeenCalled();
  });

  it('allows a super-admin to reset a member in another organization', async () => {
    fx.actor = 'support-a';
    const response = await adminResetAssessment(resetRequest('member-b'), resetParams('member-b'));
    expect(response.status).toBe(200);
    expect(fx.retake).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-b',
      staffUserId: 'support-a',
      staffRole: 'admin',
    });
  });

  it('returns 404 for an unknown member before mutation', async () => {
    fx.actor = 'admin-a';
    const response = await adminResetAssessment(resetRequest('missing-member'), resetParams('missing-member'));
    expect(response.status).toBe(404);
    expect(fx.retake).not.toHaveBeenCalled();
  });
});

describe('neighboring assessment and private resume endpoints share the assignment boundary', () => {
  it.each(['unassigned-a', 'partner-a', 'employer-a'])('denies %s assessment reset before mutation', async (actor) => {
    fx.actor = actor;
    const response = await assessmentRetake(new Request('https://example.test/api/counselor/assessment-retake', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId: 'member-a' }),
    }));
    expect(response.status).toBe(403);
    expect(fx.retake).not.toHaveBeenCalled();
  });

  it('lets a same-org admin authorize a retake without a counselor assignment', async () => {
    fx.actor = 'admin-a';
    const response = await assessmentRetake(new Request('https://example.test/api/counselor/assessment-retake', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId: 'member-a' }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: expect.stringContaining('prompt in their portal'),
    });
    expect(fx.retake).toHaveBeenCalledExactlyOnceWith({
      memberId: 'member-a',
      staffUserId: 'admin-a',
      staffRole: 'admin',
      reason: null,
    });
  });

  it.each(['unassigned-a', 'partner-a', 'employer-a'])('denies %s private resume before lookup or signing', async (actor) => {
    fx.actor = actor;
    const response = await counselorResume(new Request('https://example.test/api/counselor/members/member-a/resume') as never,
      { params: Promise.resolve({ memberId: 'member-a' }) });
    expect(response.status).toBe(403);
    expect(fx.profileRead).not.toHaveBeenCalled();
    expect(fx.sign).not.toHaveBeenCalled();
    expect(fx.download).not.toHaveBeenCalled();
  });

  it('allows the assigned counselor to obtain an expiring private resume link', async () => {
    fx.actor = 'assigned-a';
    const response = await counselorResume(new Request('https://example.test/api/counselor/members/member-a/resume') as never,
      { params: Promise.resolve({ memberId: 'member-a' }) });
    expect(response.status).toBe(200);
    expect(fx.sign).toHaveBeenCalledExactlyOnceWith('member-a/resume-original.pdf', 3600);
  });
});
