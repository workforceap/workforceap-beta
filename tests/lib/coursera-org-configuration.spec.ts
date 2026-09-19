// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/cache', () => ({ getCacheOrFetch: vi.fn(), invalidateCache: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-fixture' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/xapi/config', () => ({ getXapiReadiness: () => ({}), getXapiConfig: () => ({ clientId: '', clientSecret: '' }) }));
import { B4BConfigurationError, getB4BOrgId, getOrgInfo, listUsers } from '@/lib/coursera/b4bClient';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import { GET as selfTest } from '@/app/api/admin/coursera/self-test/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  for (const key of ['COURSERA_ORG_ID', 'COURSERA_B4B_CLIENT_ID', 'COURSERA_B4B_CLIENT_SECRET', 'COURSERA_XAPI_CLIENT_ID', 'COURSERA_XAPI_CLIENT_SECRET']) vi.stubEnv(key, '');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('required Coursera organization configuration', () => {
  it.each([undefined, '', '  '])('does not fall back to any organization when configuration is %s', async (value) => {
    vi.stubEnv('COURSERA_ORG_ID', value);
    expect(() => getB4BOrgId()).toThrow(B4BConfigurationError);
    await expect(getOrgInfo()).rejects.toMatchObject({ code: 'COURSERA_ORG_NOT_CONFIGURED' });
    await expect(listUsers()).rejects.toBeInstanceOf(B4BConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the trimmed configured organization identifier', () => {
    vi.stubEnv('COURSERA_ORG_ID', ' provider-fixture ');
    expect(getB4BOrgId()).toBe('provider-fixture');
  });
  it('preserves local member progress fallback without cache or provider work', async () => {
    const result = await fetchLearnerProgressFromB4B('learner@example.test');
    expect(result.size).toBe(0);
    expect(result.coverage).toBe('unavailable');
    expect(getCacheOrFetch).not.toHaveBeenCalled();
    expect(invalidateCache).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('self-test stops before inbound statements or outbound calls when org is missing', async () => {
    const response = await selfTest(new Request('https://example.test/api/admin/coursera/self-test'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'COURSERA_ORG_ID must be configured before using Coursera B4B.', code: 'COURSERA_ORG_NOT_CONFIGURED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
