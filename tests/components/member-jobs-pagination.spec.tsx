import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GucContext } from '@/lib/db/gucContext';
import en from '@/messages/en.json';

type Row = Record<string, unknown>;
type ApiJob = { id: string; youthAppropriate: boolean; minimumAge: number | null };
type Query = {
  where?: unknown;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  cursor?: { id: string };
  skip?: number;
  take?: number;
  select?: unknown;
};

const state = vi.hoisted(() => ({
  jobs: [] as Row[],
  user: null as { id: string } | null,
  profile: null as Row | null,
  profileFailed: false,
  context: { userId: null, orgId: null, role: 'anonymous' } as GucContext,
  cache: new Map<string, unknown>(),
  cacheKeys: [] as string[],
  reads: [] as Query[],
}));

function object(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function compare(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === right) return 0;
  if (typeof left === 'string' && typeof right === 'string') return left < right ? -1 : 1;
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1;
  throw new Error(`Unsupported comparison: ${String(left)}, ${String(right)}`);
}

function field(value: unknown, condition: unknown): boolean {
  if (!object(condition)) return value === condition || (condition === null && value == null);
  const normalize = (v: unknown) => condition.mode === 'insensitive' ? String(v).toLowerCase() : String(v);
  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case 'mode': return true;
      case 'equals': return normalize(value) === normalize(expected);
      case 'startsWith': return typeof value === 'string' && normalize(value).startsWith(normalize(expected));
      case 'endsWith': return typeof value === 'string' && normalize(value).endsWith(normalize(expected));
      case 'contains': return typeof value === 'string' && normalize(value).includes(normalize(expected));
      case 'not': return object(expected) ? !field(value, expected) : value !== expected;
      case 'notIn': return !(expected as unknown[]).includes(value);
      case 'in': return (expected as unknown[]).includes(value);
      case 'has': return Array.isArray(value) && value.includes(expected);
      case 'gte': return value != null && compare(value, expected) >= 0;
      case 'lte': return value != null && compare(value, expected) <= 0;
      default: throw new Error(`Unsupported Prisma operator ${operator}`);
    }
  });
}

function matches(row: Row, where: unknown): boolean {
  if (where == null) return true;
  if (!object(where)) throw new Error('Expected a Prisma where object');
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    const list = Array.isArray(condition) ? condition : [condition];
    if (key === 'AND') return list.every((c) => matches(row, c));
    if (key === 'OR') return list.some((c) => matches(row, c));
    if (key === 'NOT') return !list.some((c) => matches(row, c));
    if (!(key in row)) throw new Error(`Unsupported Prisma field ${key}`);
    return object(row[key]) && object(condition) ? matches(row[key], condition) : field(row[key], condition);
  });
}

function queryJobs(query: Query = {}): Row[] {
  let jobs = state.jobs.filter((job) =>
    (!state.context.orgId || job.organizationId === state.context.orgId) && matches(job, query.where),
  );
  const order = Array.isArray(query.orderBy) ? query.orderBy : query.orderBy ? [query.orderBy] : [];
  jobs = jobs.toSorted((a, b) => {
    for (const clause of order) {
      for (const [key, direction] of Object.entries(clause)) {
        const result = compare(a[key], b[key]);
        if (result) return direction === 'desc' ? -result : result;
      }
    }
    return 0;
  });
  const cursorIndex = query.cursor ? jobs.findIndex((job) => job.id === query.cursor?.id) : 0;
  const start = Math.max(0, cursorIndex) + (query.skip ?? 0);
  return jobs.slice(start, query.take === undefined ? undefined : start + query.take);
}

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => state.user) }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: NextRequest) => Promise<Response>) => async (request: NextRequest) => {
    const { runWithGucContext } = await import('@/lib/db/gucContext');
    return runWithGucContext(state.context, () => handler(request));
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    job: {
      findMany: vi.fn(async (query: Query) => { state.reads.push(query); return queryJobs(query); }),
      count: vi.fn(async (query: Query) => queryJobs(query).length),
    },
    profile: { findUnique: vi.fn(async () => {
      if (state.profileFailed) throw new Error('Synthetic profile read failure');
      return state.profile;
    }) },
    jobApplication: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
    aIJobMatch: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: vi.fn(async (key: string, fetcher: () => Promise<unknown>) => {
    state.cacheKeys.push(key);
    if (state.cache.has(key)) return state.cache.get(key);
    const value = await fetcher();
    state.cache.set(key, value);
    return value;
  }),
  invalidateCache: vi.fn(async (pattern: string) => {
    if (pattern !== 'jobs:list:*') throw new Error(`Unexpected invalidation ${pattern}`);
    for (const key of state.cache.keys()) if (key.startsWith('jobs:list:')) state.cache.delete(key);
  }),
}));
vi.mock('@/lib/storage/publicAssetUrl', () => ({ resolveSupabasePublicAssetUrl: (_bucket: string, path: string | null) => path }));
vi.mock('@/lib/api/errors', () => ({ handleApiError: () => new Response(null, { status: 500 }) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (data: unknown) => data) }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

import { GET } from '@/app/api/(portal)/dashboard/jobs/route';
import JobsPage from '@/app/(portal)/dashboard/jobs/page';
import { runWithGucContext } from '@/lib/db/gucContext';
import { invalidateJobListings } from '@/lib/jobs/listingCache';

function job(index: number, overrides: Row = {}): Row {
  return {
    id: `job-${String(index).padStart(5, '0')}`,
    title: `Support role ${index}`,
    description: 'Customer support',
    organizationId: 'org-a',
    status: 'live',
    expiresAt: null,
    youthAppropriate: true,
    minimumAge: null,
    location: 'Austin, TX',
    locationType: 'remote',
    jobType: 'fulltime',
    salaryMin: 40000,
    salaryMax: 50000,
    suggestedPrograms: [],
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    employer: { companyName: 'Real Employer', logoUrl: null, status: 'active' },
    ...overrides,
  };
}

function member(years: number) {
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - years);
  state.user = { id: 'member-a' };
  state.context = { userId: 'member-a', orgId: 'org-a', role: 'member' };
  state.profile = { dob, isMinor: years < 18, user: { courseEnrollments: [] } };
}

async function request(query = '') {
  const response = await GET(new NextRequest(`http://localhost/api/dashboard/jobs${query}`));
  expect(response.status).toBe(200);
  return response.json();
}

async function showPage(params: Record<string, string>) {
  const ui = await runWithGucContext(state.context, () => JobsPage({ searchParams: Promise.resolve(params) }));
  render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
  return within(document.getElementById('open-roles') as HTMLElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.jobs = Array.from({ length: 130 }, (_, index) => job(index + 1));
  state.user = null;
  state.profile = null;
  state.profileFailed = false;
  state.context = { userId: null, orgId: null, role: 'anonymous' };
  state.cache.clear();
  state.cacheKeys = [];
  state.reads = [];
});
afterEach(cleanup);

describe('WAP-272 jobs pagination through the actual route and member page', () => {
  it('returns distinct first and second API pages with the exact 130-job total', async () => {
    state.jobs.reverse(); // Equal timestamps must use a unique tie-breaker, not database arrival order.
    const first = await request('?page=1&pageSize=100');
    const second = await request('?page=2&pageSize=100');
    expect(first).toMatchObject({ total: 130, page: 1, pageSize: 100, totalPages: 2 });
    expect(second).toMatchObject({ total: 130, page: 2, pageSize: 100, totalPages: 2 });
    expect(first.jobs).toHaveLength(100);
    expect(second.jobs).toHaveLength(30);
    expect(first.jobs[0].id).toBe('job-00001');
    expect(second.jobs[0].id).toBe('job-00101');
    expect(new Set([...first.jobs, ...second.jobs].map((row: ApiJob) => row.id)).size).toBe(130);
  });

  it('preserves the unparameterized array response for existing API consumers', async () => {
    const result = await request();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(100);
  });

  it('excludes QA employers/titles, including JS-trim whitespace, before counting and paging', async () => {
    const employer = (companyName: string) => ({ companyName, logoUrl: null, status: 'active' });
    state.jobs.unshift(
      job(-5, { employer: employer('QA Employer Co') }),
      job(-4, { employer: employer(' \u00a0QA Employer Co\ufeff ') }),
      job(-3, { employer: employer('Capital Area Employer Network\u00a0') }),
      job(-2, { title: ' \u2003[QA] Support fixture' }),
      job(-1, { title: '[Preview] Support fixture' }),
      job(0, { employer: { ...employer('Gone Co'), status: 'inactive' } }),
      job(200, { expiresAt: new Date('2020-01-01T00:00:00Z') }),
    );
    const result = await request('?page=2&pageSize=100');
    expect(result.total).toBe(130);
    expect(result.jobs).toHaveLength(30);
    expect(result.jobs.map((row: ApiJob) => row.id)).toEqual(Array.from({ length: 30 }, (_, index) => job(index + 101).id));
  });

  it('retains legitimate names that merely contain an exclusion token', async () => {
    state.jobs = [job(1, { employer: { companyName: '\u00a0Contest Labs\u00a0', logoUrl: null, status: 'active' } })];
    const result = await request('?page=1');
    expect(result.total).toBe(1);
    expect(result.jobs[0].employer.companyName).toBe('\u00a0Contest Labs\u00a0');
  });

  it.each(['minor', 'profile-failure'])('keeps paginated %s requests on the youth board even when adult is requested', async (scenario) => {
    member(16);
    state.profileFailed = scenario === 'profile-failure';
    state.jobs.push(job(131, { youthAppropriate: false }), job(132, { minimumAge: 21 }));
    const result = await request('?page=2&pageSize=100&ageGroup=adult18plus');
    expect(result.total).toBe(130);
    expect(result.jobs).toHaveLength(30);
    expect(result.jobs.every((row: ApiJob) => row.youthAppropriate && (row.minimumAge === null || row.minimumAge <= 17))).toBe(true);
  });

  it('gives under-14 members an empty paginated board', async () => {
    member(12);
    expect(await request('?page=2')).toMatchObject({ jobs: [], total: 0, page: 1, totalPages: 0 });
  });

  it('bounds page size and clamps a past-end page without discarding openings', async () => {
    expect(await request('?page=999999999999&pageSize=1000')).toMatchObject({ page: 2, pageSize: 100, total: 130 });
    expect(await request('?page=-2&pageSize=invalid')).toMatchObject({ page: 1, pageSize: 20, total: 130 });
  });

  it('does not reuse a cached page across effective age groups or trusted user/tenant scopes', async () => {
    member(30);
    state.jobs = [job(1, { youthAppropriate: false }), job(2), job(3, { organizationId: 'org-b' })];
    expect((await request('?page=1')).total).toBe(2);
    member(16);
    expect((await request('?page=1')).jobs.map((row: ApiJob) => row.id)).toEqual(['job-00002']);
    state.user = { id: 'member-b' };
    state.context = { userId: 'member-b', orgId: 'org-b', role: 'member' };
    expect((await request('?page=1')).jobs.map((row: ApiJob) => row.id)).toEqual(['job-00003']);
  });

  it('reuses bounded padded-fixture inspection across API pages under the same scope', async () => {
    state.jobs.unshift(job(0, { title: '\ufeff[TEST] fixture' }));
    await request('?page=1&pageSize=100');
    const candidateReads = state.reads.filter((query) => query.select);
    expect(candidateReads.length).toBeGreaterThan(0);
    await request('?page=2&pageSize=100');
    expect(state.reads.filter((query) => query.select)).toHaveLength(candidateReads.length);
  });

  it('finishes multiple narrow metadata batches without truncating the matching total', async () => {
    state.jobs.unshift(...Array.from({ length: 250 }, (_, index) => job(index + 1000, { title: ' \u00a0[QA] fixture' })));
    const result = await request('?page=2&pageSize=100');
    expect(result.total).toBe(130);
    expect(result.jobs).toHaveLength(30);
    const inspections = state.reads.filter((query) => query.select);
    expect(inspections).toHaveLength(2);
    expect(inspections.every((query) => query.take === 200)).toBe(true);
  });

  it('reports unavailable instead of silently truncating an oversized padded-fixture set', async () => {
    state.jobs.unshift(...Array.from({ length: 1001 }, (_, index) => job(index + 1000, { title: '\ufeff[QA] fixture' })));
    const response = await GET(new NextRequest('http://localhost/api/dashboard/jobs?page=1'));
    expect(response.status).toBe(500);
    expect(state.cache.size).toBe(0);
  });

  it('reports unavailable for a crowded legitimate-candidate set instead of inspecting it without a bound', async () => {
    state.jobs = Array.from({ length: 5001 }, (_, index) => job(index + 1, {
      employer: { companyName: '\u00a0Contest Labs\u00a0', logoUrl: null, status: 'active' },
    }));
    const response = await GET(new NextRequest('http://localhost/api/dashboard/jobs?page=1'));
    expect(response.status).toBe(500);
    expect(state.cache.size).toBe(0);
    expect(state.reads.filter((query) => query.select)).toHaveLength(26);
  });

  it('invalidates both cached pages and padded-fixture exclusions through the existing listing invalidation', async () => {
    expect((await request('?page=1')).total).toBe(130);
    state.jobs.push(job(131), job(132, { title: '\ufeff[QA] fixture' }));
    await invalidateJobListings();
    const result = await request('?page=1');
    expect(result.total).toBe(131);
    expect(result.jobs).toHaveLength(20);
    expect(state.cacheKeys.every((key) => key.startsWith('jobs:list:'))).toBe(true);
  });

  it('keeps filtered counts independent and permits age parameters only to narrow an adult board', async () => {
    member(30);
    state.jobs.push(job(131, { youthAppropriate: false }));
    expect((await request('?page=1&q=Support%20role%2013')).total).toBe(3);
    expect((await request('?page=1&ageGroup=youth14to17')).total).toBe(130);
    expect((await request('?page=1')).total).toBe(131);
  });

  it('renders the real current-kit page 2 with openings 21–40 and accessible navigation', async () => {
    member(30);
    const section = await showPage({ view: 'all', page: '2' });
    const rows = section.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/dashboard/jobs/job-'));
    expect(rows).toHaveLength(20);
    expect(rows[0]).toHaveAttribute('href', '/dashboard/jobs/job-00021');
    expect(rows.at(-1)).toHaveAttribute('href', '/dashboard/jobs/job-00040');
    expect(section.getByText('130 live openings')).toBeInTheDocument();
    const pages = section.getByRole('navigation', { name: 'Open role pages' });
    expect(within(pages).getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/dashboard/jobs?view=all&page=1#open-roles');
    expect(within(pages).getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/dashboard/jobs?view=all&page=3#open-roles');
    expect(within(pages).getByText('Showing 21–40 of 130 openings')).toBeInTheDocument();
    expect(document.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });

  it('uses the same padded-QA exclusions and fail-closed age rules on the server-rendered all view', async () => {
    member(16);
    state.profileFailed = true;
    state.jobs.unshift(job(0, { title: ' \u00a0[QA] fixture' }));
    state.jobs.push(job(131, { youthAppropriate: false }));
    const section = await showPage({ view: 'all', page: '7', ageGroup: 'adult18plus' });
    expect(section.getByText('130 live openings')).toBeInTheDocument();
    expect(section.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/dashboard/jobs/job-'))).toHaveLength(10);
    expect(section.queryByText('Support role 131')).toBeNull();
    expect(section.queryByText(/fixture/)).toBeNull();
    expect(section.queryByRole('link', { name: 'Next page' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Browse openings' })).toHaveAttribute('href', '#open-roles');
  });

  it('shows the existing unavailable state without counts or pagination when server inspection exceeds its bound', async () => {
    member(30);
    state.jobs.unshift(...Array.from({ length: 1001 }, (_, index) => job(index + 1000, { title: '\ufeff[QA] fixture' })));
    const section = await showPage({ view: 'all', page: '2' });
    expect(section.getByText(en.empty.openingsUnavailable.title)).toBeInTheDocument();
    expect(section.getByRole('link', { name: en.empty.openingsUnavailable.action })).toHaveAttribute('href', '/dashboard/jobs?view=all&page=2#open-roles');
    expect(section.queryByRole('navigation', { name: 'Open role pages' })).toBeNull();
    expect(section.queryByText(/^\d+ live openings?$/)).toBeNull();
    expect(section.queryByRole('link', { name: /See all/ })).toBeNull();
  });
});
