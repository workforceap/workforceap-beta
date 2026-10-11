import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: vi.fn(() => []),
    })
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  requireAdminOrCounselor: vi.fn(),
  isAdmin: vi.fn(),
}));


vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/member/exportData', () => ({
  buildMemberExport: vi.fn(),
}));

// The real role/assignment boundary is covered by member-data-access-boundaries.spec.ts.
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(async () => true),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({ ip: null, ua: null })),
}));

// ─── Imports after mocks ───
import { GET as memberExportGET } from '@/app/api/member/export-data/route';
import { GET as adminExportGET } from '@/app/api/admin/members/[id]/export-data/route';
import { getUser } from '@/lib/auth/server';
import { requireAdminOrCounselor } from '@/lib/auth/roles';
import { buildMemberExport } from '@/lib/member/exportData';
import { prisma } from '@/lib/db/prisma';

describe('GET /api/member/export-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await memberExportGET(new Request('http://localhost:3000/api/member/export-data'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns member data export for authenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);

    const mockExport = {
      exportMeta: { generatedAt: '2024-01-01T00:00:00.000Z', version: '1.0' },
      member: { id: 'user-123', email: 'jane@example.com', fullName: 'Jane Doe' },
      profile: { address: '123 Main St' },
      applications: [],
      jobApplications: [],
      courseEnrollments: [],
      courseProgress: [],
      memberProgramProgress: [],
      readinessChecklist: [],
      goals: [],
      learningProgress: [],
      resourceProgress: [],
      memberEvents: [],
      weeklyRecaps: [],
      pathwayStepProgress: [],
      trainingAccessRequests: [],
      programChangeRequests: [],
      benefitRequests: [],
      certifications: [],
      aiToolResults: [],
      messages: [],
      placementRecord: null,
      placedOutcome: null,
      counselorAssignments: [],
      counselorNotes: [],
      partnerReferrals: [],
      memberSubgroups: [],
      mentorSessions: [],
      points: null,
      pointsTransactions: [],
      courseraProgress: [],
      courseraBadges: [],
      courseraSkillsets: [],
      preScreeningResponse: null,
      preScreeningDraft: null,
      placementSurveys: [],
      testimonials: [],
      nextBestActions: [],
      auditLogs: [],
      jobPostingApplications: [],
      aiJobMatches: [],
      applicationAiFeedbacks: [],
      portalWorkflowEvents: [],
    };

    vi.mocked(buildMemberExport).mockResolvedValue(mockExport as any);

    const res = await memberExportGET(new Request('http://localhost:3000/api/member/export-data'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.id).toBe('user-123');
    expect(body.member.email).toBe('jane@example.com');
    expect(body.exportMeta.version).toBe('1.0');
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(buildMemberExport).mockRejectedValue(new Error('User not found'));

    const res = await memberExportGET(new Request('http://localhost:3000/api/member/export-data'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(buildMemberExport).mockRejectedValue(new Error('Database connection failed'));

    const res = await memberExportGET(new Request('http://localhost:3000/api/member/export-data'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('GET /api/admin/members/[id]/export-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route now resolves the acting admin and org-scopes the member lookup.
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123' } as any);
    vi.mocked(prisma.user.findFirst).mockImplementation((async ({ where }: any) => ({ id: where.id })) as any);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const req = new Request('http://localhost:3000/api/admin/members/user-123/export-data');
    const res = await adminExportGET(req as any, { params: Promise.resolve({ id: 'user-123' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when not admin or counselor', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Forbidden: admin or counselor access required', status: 403 });

    const req = new Request('http://localhost:3000/api/admin/members/user-123/export-data');
    const res = await adminExportGET(req as any, { params: Promise.resolve({ id: 'user-123' }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden: admin or counselor access required');
  });

  it('returns member data export for admin user', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-123' });

    const mockExport = {
      exportMeta: { generatedAt: '2024-01-01T00:00:00.000Z', version: '1.0' },
      member: { id: 'user-456', email: 'john@example.com', fullName: 'John Doe' },
      profile: { address: '456 Oak St' },
      applications: [],
      jobApplications: [],
      courseEnrollments: [],
      courseProgress: [],
      memberProgramProgress: [],
      readinessChecklist: [],
      goals: [],
      learningProgress: [],
      resourceProgress: [],
      memberEvents: [],
      weeklyRecaps: [],
      pathwayStepProgress: [],
      trainingAccessRequests: [],
      programChangeRequests: [],
      benefitRequests: [],
      certifications: [],
      aiToolResults: [],
      messages: [],
      placementRecord: null,
      placedOutcome: null,
      counselorAssignments: [],
      counselorNotes: [],
      partnerReferrals: [],
      memberSubgroups: [],
      mentorSessions: [],
      points: null,
      pointsTransactions: [],
      courseraProgress: [],
      courseraBadges: [],
      courseraSkillsets: [],
      preScreeningResponse: null,
      preScreeningDraft: null,
      placementSurveys: [],
      testimonials: [],
      nextBestActions: [],
      auditLogs: [],
      jobPostingApplications: [],
      aiJobMatches: [],
      applicationAiFeedbacks: [],
      portalWorkflowEvents: [],
    };

    vi.mocked(buildMemberExport).mockResolvedValue(mockExport as any);

    const req = new Request('http://localhost:3000/api/admin/members/user-456/export-data');
    const res = await adminExportGET(req as any, { params: Promise.resolve({ id: 'user-456' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.id).toBe('user-456');
    expect(body.member.email).toBe('john@example.com');
  });

  it('returns 404 when member not found', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-123' });
    vi.mocked(buildMemberExport).mockRejectedValue(new Error('User not found'));

    const req = new Request('http://localhost:3000/api/admin/members/user-999/export-data');
    const res = await adminExportGET(req as any, { params: Promise.resolve({ id: 'user-999' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Member not found');
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-123' });
    vi.mocked(buildMemberExport).mockRejectedValue(new Error('Database connection failed'));

    const req = new Request('http://localhost:3000/api/admin/members/user-456/export-data');
    const res = await adminExportGET(req as any, { params: Promise.resolve({ id: 'user-456' }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
