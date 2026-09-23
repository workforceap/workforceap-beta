/**
 * E01: a job whose employer an admin deactivated or rejected
 * (`Employer.status = 'inactive'`) must stop reaching members.
 *
 * The fake prisma below evaluates each route's real `where` clause over three
 * live jobs (active, inactive and pending_approval employers), so these cases
 * prove what a member receives, not that a query contains a given string.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const JOB_ACTIVE = '11111111-1111-4111-8111-111111111111';
const JOB_INACTIVE = '22222222-2222-4222-8222-222222222222';
const JOB_PENDING = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const EMPLOYER_ID = '55555555-5555-4555-8555-555555555555';

// ─── Tiny Prisma `where` evaluator (throws on anything it does not model) ───

function isPlainObject(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function cmp(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as number);
  const y = b instanceof Date ? b.getTime() : (b as number);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchesField(value: unknown, cond: unknown): boolean {
  if (!isPlainObject(cond)) return value === cond || (cond === null && value == null);
  const insensitive = cond.mode === 'insensitive';
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case 'mode':
        return true;
      case 'equals':
        return value === arg;
      case 'not':
        return isPlainObject(arg) ? !matchesField(value, arg) : value !== arg;
      case 'in':
        return (arg as unknown[]).includes(value);
      case 'notIn':
        return !(arg as unknown[]).includes(value);
      case 'gte':
        return value != null && cmp(value, arg) >= 0;
      case 'lte':
        return value != null && cmp(value, arg) <= 0;
      case 'gt':
        return value != null && cmp(value, arg) > 0;
      case 'lt':
        return value != null && cmp(value, arg) < 0;
      case 'has':
        return Array.isArray(value) && value.includes(arg);
      case 'contains': {
        if (typeof value !== 'string') return false;
        return insensitive
          ? value.toLowerCase().includes(String(arg).toLowerCase())
          : value.includes(String(arg));
      }
      default:
        throw new Error(`fake prisma: unsupported operator "${op}"`);
    }
  });
}

function matches(row: Row, where: unknown): boolean {
  if (where == null) return true;
  if (!isPlainObject(where)) throw new Error('fake prisma: where must be an object');
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((c) => matches(row, c));
    if (key === 'OR') return (cond as unknown[]).some((c) => matches(row, c));
    if (key === 'NOT') return !(Array.isArray(cond) ? cond : [cond]).some((c) => matches(row, c));
    const value = row[key];
    if (isPlainObject(value) && isPlainObject(cond)) {
      const relationCond = 'is' in cond ? cond.is : cond;
      return matches(value, relationCond);
    }
    if (!(key in row)) throw new Error(`fake prisma: unknown field "${key}"`);
    return matchesField(value, cond);
  });
}

function makeJob(id: string, companyName: string, employerStatus: string): Row {
  return {
    id,
    title: 'Python Developer',
    description: 'Write python services',
    requirements: ['python'],
    preferredCertifications: [],
    suggestedPrograms: [],
    status: 'live',
    expiresAt: null,
    youthAppropriate: true,
    minimumAge: null,
    location: 'Austin, TX',
    locationType: 'remote',
    jobType: 'fulltime',
    salaryMin: 50000,
    salaryMax: 70000,
    organizationId: 'org-1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    employerId: `${id}-employer`,
    employer: {
      id: `${id}-employer`,
      companyName,
      logoUrl: null,
      contactEmail: `${companyName.replace(/\s+/g, '').toLowerCase()}@example.com`,
      status: employerStatus,
    },
  };
}

const JOBS: Row[] = [
  makeJob(JOB_ACTIVE, 'Active Co', 'active'),
  makeJob(JOB_INACTIVE, 'Gone Co', 'inactive'),
  makeJob(JOB_PENDING, 'Pending Co', 'pending_approval'),
];

const MATCHES: Row[] = JOBS.map((job, i) => ({
  id: `match-${i}`,
  studentId: MEMBER_ID,
  jobId: job.id,
  matchScore: 90 - i,
  createdAt: new Date('2026-09-02T00:00:00Z'),
  job,
}));

function findAll(rows: Row[], args?: { where?: unknown; take?: number }): Row[] {
  const hit = rows.filter((r) => matches(r, args?.where));
  return typeof args?.take === 'number' ? hit.slice(0, args.take) : hit;
}

// ─── Mocks ───

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    void fn;
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma: Record<string, any> = {
    job: {
      findMany: vi.fn(async (args: any) => findAll(JOBS, args)),
      findFirst: vi.fn(async (args: any) => findAll(JOBS, args)[0] ?? null),
      findUnique: vi.fn(async (args: any) => findAll(JOBS, args)[0] ?? null),
    },
    aIJobMatch: {
      findMany: vi.fn(async (args: any) => findAll(MATCHES, args)),
    },
    user: {
      findUnique: vi.fn(async () => ({
        fullName: 'Member One',
        email: 'member@example.com',
        enrolledProgram: null,
        assessmentScorePct: null,
        memberProgramProgress: [],
        courseProgress: [],
        userCertifications: [],
      })),
    },
    profile: { findUnique: vi.fn(async () => null) },
    jobApplication: { findMany: vi.fn(async () => []) },
    jobPostingApplication: { findUnique: vi.fn() },
    employer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  prisma.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma };
});

vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  invalidateCache: vi.fn(async () => {}),
}));

vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (_bucket: string, path: string | null) => path,
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(() => null),
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: vi.fn(),
  captureApiResponseError: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendNewJobApplicationEmail: vi.fn(),
  sendEmployerRejectedEmail: vi.fn(async () => {}),
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/jobs/syncCuratedJobToTracker', () => ({
  syncCuratedJobToTracker: vi.fn(async () => ({ id: 'tracker-row' })),
}));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/ai/aiUnavailableResponse', () => ({ ifAiUnconfigured: vi.fn(() => null) }));
vi.mock('@/lib/ai/jobTailor', () => ({
  tailorResumeForJob: vi.fn(async () => ({ ok: true, tailored: 'x' })),
  JobTailorUnavailableError: class JobTailorUnavailableError extends Error {},
}));
vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: vi.fn(async () => 'python '.repeat(40)),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({})),
  logAuditEvent: vi.fn(async () => {}),
}));

// Page-level UI: the pages are called as functions and their returned props
// inspected, so the kit components only need to exist.
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (m: unknown) => m) }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));
vi.mock('@/components/portal/kit', () => ({ DesignSurface: () => null, PageOpener: () => null }));
vi.mock('@/components/portal/jobs/LogExternalApplicationButton', () => ({ default: () => null }));
vi.mock('@/app/(portal)/dashboard/jobs/JobsListingClient', () => ({ default: () => null }));
vi.mock('@/app/(portal)/dashboard/jobs/JobsBoardSkeleton', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/member/MemberJobsKit', () => ({
  JOBS_OPEN_ROLES_ANCHOR: '#open-roles',
  MemberJobsKit: () => null,
}));
vi.mock('@/app/(portal)/dashboard/jobs/[id]/MobileApplyFunnel', () => ({ default: () => null }));
vi.mock('@/app/(portal)/dashboard/jobs/[id]/ReferralCopyButton', () => ({ default: () => null }));
vi.mock('@/components/portal/JobTailorPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/member/MemberJobDetail', () => ({ MemberJobDetail: () => null }));

// ─── Imports after mocks ───

import { GET as listJobs } from '@/app/api/(portal)/dashboard/jobs/route';
import { GET as getJobDetail } from '@/app/api/(portal)/dashboard/jobs/[id]/route';
import { POST as applyForJob } from '@/app/api/(portal)/dashboard/jobs/[id]/apply/route';
import { GET as getMatchedJobs } from '@/app/api/member/matched-jobs/route';
import { POST as trackCurated } from '@/app/api/member/job-applications/track-curated/route';
import { POST as tailorJob } from '@/app/api/ai/job-tailor/[jobId]/route';
import { POST as deactivateEmployer } from '@/app/api/admin/employers/[id]/deactivate/route';
import { POST as rejectEmployer } from '@/app/api/admin/employers/[id]/reject/route';
import { POST as reactivateEmployer } from '@/app/api/admin/employers/[id]/reactivate/route';
import JobsPage from '@/app/(portal)/dashboard/jobs/page';
import JobDetailPage, { generateMetadata as jobDetailMetadata } from '@/app/(portal)/dashboard/jobs/[id]/page';
import { findBestEmployerMatch } from '@/lib/ai/proactiveJobMatcher';
import { getUser } from '@/lib/auth/server';
import { invalidateCache } from '@/lib/cache';
import { prisma } from '@/lib/db/prisma';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue({ id: MEMBER_ID, email: 'member@example.com' } as any);
  vi.mocked(invalidateCache).mockClear();
  vi.mocked(prisma.jobPostingApplication.findUnique).mockReset();
});

describe('member job list and matches exclude inactive employers', () => {
  it('GET /api/dashboard/jobs lists active and pending employers, not inactive', async () => {
    const res = await listJobs(new Request('http://localhost/api/dashboard/jobs') as any);
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as Array<{ id: string }>).map((j) => j.id);
    expect(ids).toEqual([JOB_ACTIVE, JOB_PENDING]);
  });

  it('GET /api/dashboard/jobs keyword search cannot surface an inactive employer by name', async () => {
    const res = await listJobs(new Request('http://localhost/api/dashboard/jobs?q=gone') as any);
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/member/matched-jobs never scores an inactive employer job', async () => {
    const res = await getMatchedJobs(new Request('http://localhost/api/member/matched-jobs') as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: Array<{ id: string }> };
    expect(body.jobs.map((j) => j.id).sort()).toEqual([JOB_ACTIVE, JOB_PENDING].sort());
  });

  it('the career workflow best-employer match skips an inactive employer', async () => {
    const onlyInactive = JOBS.filter((j) => j.id === JOB_INACTIVE);
    vi.mocked(prisma.job.findMany).mockImplementationOnce(((args: any) => Promise.resolve(findAll(onlyInactive, args))) as any);
    await expect(findBestEmployerMatch(MEMBER_ID, 'python')).resolves.toBeNull();

    const best = await findBestEmployerMatch(MEMBER_ID, 'python');
    expect(best?.id).toBe(JOB_ACTIVE);
  });

  it('/dashboard/jobs open roles and recommendations omit the inactive employer', async () => {
    const page = (await JobsPage({ searchParams: Promise.resolve({}) })) as any;
    const kit = page.props.children;
    const openRoleIds = (kit.props.openRoles as Array<{ id: string }>).map((r) => r.id);
    const recommendedIds = (kit.props.recommended as Array<{ id: string }>).map((r) => r.id);
    expect(openRoleIds).toEqual([JOB_ACTIVE, JOB_PENDING]);
    expect(kit.props.openRolesTotal).toBe(2);
    expect(recommendedIds).toEqual([JOB_ACTIVE, JOB_PENDING]);
  });
});

// WAP-260: the page's live-jobs query must carry the youth restriction for a
// member it cannot prove is an adult. One adult-only job (not youthAppropriate)
// is added to the fixtures for these cases; the real `where` decides.
describe('/dashboard/jobs fails closed to the youth board', () => {
  const ADULT_ONLY = { ...JOBS[0], id: '66666666-6666-4666-8666-666666666666', youthAppropriate: false };
  const openRoleIds = async () => {
    vi.mocked(prisma.job.findMany).mockImplementationOnce(((args: any) => Promise.resolve(findAll([...JOBS, ADULT_ONLY], args))) as any);
    const page = (await JobsPage({ searchParams: Promise.resolve({}) })) as any;
    return (page.props.children.props.openRoles as Array<{ id: string }>).map((r) => r.id);
  };

  it('a failed profile read never shows the adult-only job', async () => {
    vi.mocked(prisma.profile.findUnique).mockRejectedValueOnce(new Error('db down'));
    expect(await openRoleIds()).not.toContain(ADULT_ONLY.id);
  });

  it('a minor with no date of birth does not see the adult-only job', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValueOnce({ dob: null, isMinor: true } as any);
    expect(await openRoleIds()).not.toContain(ADULT_ONLY.id);
  });

  it('an adult still sees it', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValueOnce({ dob: new Date('1990-01-01'), isMinor: false } as any);
    expect(await openRoleIds()).toContain(ADULT_ONLY.id);
  });
});

describe('direct links to an inactive employer job behave as not found', () => {
  it('GET /api/dashboard/jobs/[id] is 404 for inactive and 200 for active', async () => {
    const req = () => new Request('http://localhost/api/dashboard/jobs/x') as any;
    expect((await getJobDetail(req(), params(JOB_INACTIVE))).status).toBe(404);
    expect((await getJobDetail(req(), params(JOB_ACTIVE))).status).toBe(200);
  });

  it('/dashboard/jobs/[id] page calls notFound for inactive, renders for active', async () => {
    await expect(JobDetailPage(params(JOB_INACTIVE))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(JobDetailPage(params(JOB_ACTIVE))).resolves.toBeTruthy();
    const meta = (await jobDetailMetadata(params(JOB_INACTIVE))) as { title: string };
    expect(meta.title).toBe('Job');
  });

  it('POST apply is 404 for an inactive employer job (no application, no employer email)', async () => {
    const applyReq = () =>
      new Request('http://localhost/api/dashboard/jobs/x/apply', {
        method: 'POST',
        body: JSON.stringify({ shareProfile: true }),
      }) as any;
    // Positive control: the active job is found, then hits "Already applied".
    vi.mocked(prisma.jobPostingApplication.findUnique).mockResolvedValue({ id: 'existing' } as any);
    expect((await applyForJob(applyReq(), params(JOB_ACTIVE))).status).toBe(409);

    const res = await applyForJob(applyReq(), params(JOB_INACTIVE));
    expect(res.status).toBe(404);
  });

  it('POST track-curated is 404 for an inactive employer job', async () => {
    const req = (jobId: string) =>
      new Request('http://localhost/api/member/job-applications/track-curated', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      }) as any;
    expect((await trackCurated(req(JOB_INACTIVE))).status).toBe(404);
    expect((await trackCurated(req(JOB_ACTIVE))).status).toBe(200);
  });

  it('POST /api/ai/job-tailor/[jobId] is 404 for an inactive employer job', async () => {
    const req = () => new Request('http://localhost/api/ai/job-tailor/x', { method: 'POST' }) as any;
    const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
    expect((await tailorJob(req(), ctx(JOB_INACTIVE))).status).toBe(404);
    expect((await tailorJob(req(), ctx(JOB_ACTIVE))).status).not.toBe(404);
  });
});

describe('changing an employer to or from inactive flushes the cached member job list', () => {
  it('deactivate invalidates jobs:list:*', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({ id: EMPLOYER_ID, status: 'active' } as any);
    vi.mocked(prisma.employer.update).mockResolvedValue({ id: EMPLOYER_ID, status: 'inactive' } as any);
    const res = await deactivateEmployer(new Request('http://localhost', { method: 'POST' }), params(EMPLOYER_ID));
    expect(res.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith('jobs:list:*');
  });

  it('reject invalidates jobs:list:*', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({
      id: EMPLOYER_ID,
      status: 'active',
      contactEmail: null,
      companyName: 'Active Co',
      contactName: null,
    } as any);
    vi.mocked(prisma.employer.update).mockResolvedValue({ id: EMPLOYER_ID, status: 'inactive' } as any);
    const res = await rejectEmployer(
      new Request('http://localhost', { method: 'POST', body: '{}' }) as any,
      params(EMPLOYER_ID),
    );
    expect(res.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith('jobs:list:*');
  });

  it('reactivate invalidates jobs:list:* so the jobs return right away', async () => {
    vi.mocked(prisma.employer.findFirst).mockResolvedValue({ id: EMPLOYER_ID, status: 'inactive' } as any);
    vi.mocked(prisma.employer.update).mockResolvedValue({ id: EMPLOYER_ID, status: 'active' } as any);
    const res = await reactivateEmployer(new Request('http://localhost', { method: 'POST' }), params(EMPLOYER_ID));
    expect(res.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith('jobs:list:*');
  });
});
