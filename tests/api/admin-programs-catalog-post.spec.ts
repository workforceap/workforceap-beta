import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/platform/seedProgramCatalog', () => ({ seedOrganizationProgramCatalog: vi.fn() }));
vi.mock('@/lib/cache', () => ({ getCacheOrFetch: vi.fn(), invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

const create = vi.fn();
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({ organizationProgramCatalog: { create } })),
}));

import { POST } from '@/app/api/admin/programs/catalog/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440003';
const AWS = 'ai-practitioner-professional-certificate-aws';

function post(programSlug: string) {
  return POST(new Request('http://localhost:3000/api/admin/programs/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ programSlug, name: 'Tenant title', category: 'Tech', deliveryType: 'internal' }),
  }) as any);
}

describe('POST /api/admin/programs/catalog: canonical slug required (WAP-286)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_ID);
    create.mockImplementation(async ({ data }: any) => ({ id: 'row-1', ...data }));
  });

  it('rejects a legacy alias slug and names the canonical slug; nothing is created', async () => {
    for (const alias of ['ai-professional-developer-certificate-ibm', AWS.toUpperCase(), ` ${AWS}`]) {
      const res = await post(alias);
      expect(res.status, alias).toBe(400);
      expect(await res.json()).toEqual({ error: `programSlug must be the canonical program slug "${AWS}".` });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('still rejects a slug with no static program', async () => {
    const res = await post('not-a-program');
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a row for the exact canonical slug', async () => {
    const res = await post(AWS);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.programSlug).toBe(AWS);
  });
});
