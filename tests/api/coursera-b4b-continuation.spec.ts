import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findDiagnostic: vi.fn(), createDiagnostic: vi.fn(), upsertRaw: vi.fn(),
  getOrganization: vi.fn(), resolveUsers: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  workflowDiagnostic: { findFirst: mocks.findDiagnostic, create: mocks.createDiagnostic },
} }));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: mocks.getOrganization }));
vi.mock('@/lib/coursera/resolveUserIdByEmail', () => ({ resolveUserIdsByCourseraEmails: mocks.resolveUsers }));
vi.mock('@/lib/coursera/upsertCourseraCourseProgress', () => ({ upsertCourseraCourseProgress: mocks.upsertRaw }));
vi.mock('@/lib/coursera/upsertMergedCourseProgress', () => ({ upsertMergedCourseProgress: vi.fn() }));
vi.mock('@/lib/coursera/canonicalMapping', () => ({ loadCanonicalMappingsForCourseraIds: vi.fn(async () => ({})) }));
vi.mock('@/lib/coursera/curriculumMapping', () => ({
  loadCurriculumMappingsForCourseraIds: vi.fn(async () => ({})), resolveProviderCourseMappings: vi.fn(),
}));
vi.mock('@/lib/coursera/learnerProgress', () => ({ invalidateLearnerProgressCacheForEmail: vi.fn() }));
vi.mock('@/lib/coursera/programContentsCache', () => ({
  loadB4BContents: vi.fn(async () => []),
  loadB4BContentsChecked: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock('@/lib/coursera/seedCanonicalMappingsFromB4B', () => ({ seedCanonicalMappingsFromB4B: vi.fn(async () => ({})) }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handle: unknown) => handle }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(), markCronDiagnosticLogged: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: vi.fn() }));

import { _setFetchForTesting } from '@/lib/coursera/b4bClient';
import { GET } from '@/app/api/cron/coursera-b4b-sync/route';

type Diagnostic = { status: string; metadata: Record<string, unknown> };
let diagnostics: Diagnostic[];
let starts: number[];
let rejectNextPage: boolean;
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const run = () => GET(new Request('https://wap.example/api/cron/coursera-b4b-sync') as NextRequest);

describe('B4B route -> durable diagnostic -> worker continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('COURSERA_ORG_ID', 'provider-1');
    vi.stubEnv('COURSERA_B4B_CLIENT_ID', 'fixture-client');
    vi.stubEnv('COURSERA_B4B_CLIENT_SECRET', 'fixture-secret');
    diagnostics = [];
    starts = [];
    rejectNextPage = false;
    mocks.getOrganization.mockResolvedValue('tenant-1');
    mocks.resolveUsers.mockResolvedValue(new Map());
    mocks.upsertRaw.mockResolvedValue(undefined);
    mocks.createDiagnostic.mockImplementation(async ({ data }: { data: Diagnostic }) => {
      diagnostics.push(data);
      return data;
    });
    mocks.findDiagnostic.mockImplementation(async ({ where }: { where: {
      status: string;
      AND: Array<{ metadata: { equals: string } }>;
    } }) => {
      expect(where.status).toBe('ok');
      const [providerFilter, tenantFilter] = where.AND;
      return [...diagnostics].reverse().find((entry) => {
        const scope = entry.metadata.continuationScope as { providerOrgId?: string; organizationId?: string } | undefined;
        return entry.status === where.status && scope?.providerOrgId === providerFilter.metadata.equals
          && scope?.organizationId === tenantFilter.metadata.equals;
      }) ?? null;
    });
    _setFetchForTesting(async (url) => {
      if (url.includes('/oauth2/')) return response({ access_token: 'fixture-token' });
      const params = new URL(url).searchParams;
      const start = Number(params.get('start'));
      const limit = Number(params.get('limit'));
      starts.push(start);
      if (rejectNextPage) {
        rejectNextPage = false;
        return new Response('fixture failure', { status: 403 });
      }
      return response({
        elements: Array.from({ length: Math.min(limit, 850 - start) }, (_, index) => ({
          contentId: `course-${start + index}`, externalId: 'unmatched@example.com',
          programId: 'P1', contentType: 'Course', overallProgress: 37,
        })),
        paging: { total: 850, ...(start + limit < 850 ? { next: String(start + limit) } : {}) },
      });
    });
  });
  afterEach(() => { _setFetchForTesting(null); vi.unstubAllEnvs(); });

  it('logs the actual 400-row window, resumes through 850 rows, then wraps to zero', async () => {
    const first = await (await run()).json();
    expect(first).toMatchObject({ scanned: 400, nextStart: 400, capped: true, coverage: 'partial' });
    expect(diagnostics[0].metadata).toMatchObject({
      nextStart: 400, capped: true, continuationScope: { providerOrgId: 'provider-1', organizationId: 'tenant-1' },
    });
    expect(await (await run()).json()).toMatchObject({ scanned: 400, nextStart: 800, capped: true });
    expect(await (await run()).json()).toMatchObject({ scanned: 50, nextStart: 0, capped: false, coverage: 'complete' });
    await run();
    expect(starts).toEqual([0, 400, 800, 0]);
  });

  it('retries the same window after a provider failure and after a row failure', async () => {
    await run();
    rejectNextPage = true;
    expect((await run()).status).toBe(500);
    mocks.upsertRaw.mockRejectedValueOnce(new Error('fixture row failure'));
    expect(await (await run()).json()).toMatchObject({ errors: 1, coverage: 'retry_required' });
    expect(diagnostics.at(-1)?.status).toBe('error');
    expect(await (await run()).json()).toMatchObject({ errors: 0, nextStart: 800 });
    expect(starts).toEqual([0, 400, 400, 400]);
  });

  it('does not advance when the log fails, or reuse another tenant/provider cursor', async () => {
    diagnostics.push({ status: 'ok', metadata: { nextStart: 800,
      continuationScope: { providerOrgId: 'provider-2', organizationId: 'tenant-1' } } });
    diagnostics.push({ status: 'ok', metadata: { nextStart: 800,
      continuationScope: { providerOrgId: 'provider-1', organizationId: 'tenant-2' } } });
    diagnostics.push({ status: 'ok', metadata: { nextStart: 800 } });
    mocks.createDiagnostic.mockRejectedValueOnce(new Error('fixture log failure'));
    await run();
    await run();
    expect(starts).toEqual([0, 0]);
    expect(mocks.findDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      AND: [
        { metadata: { path: ['continuationScope', 'providerOrgId'], equals: 'provider-1' } },
        { metadata: { path: ['continuationScope', 'organizationId'], equals: 'tenant-1' } },
      ],
    }) }));
  });
});
