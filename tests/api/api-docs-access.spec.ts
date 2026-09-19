import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn() }));
import { GET } from '@/app/api/admin/api-docs/openapi/route';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';

beforeEach(() => { vi.clearAllMocks(); });
describe('privileged API reference download', () => {
  it('rejects anonymous requests without returning any endpoint data', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const response = await GET(new Request('https://example.invalid/api/admin/api-docs/openapi'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(isSuperAdmin).not.toHaveBeenCalled();
  });
  it.each(['member', 'counselor', 'partner', 'employer', 'admin'])('rejects the %s role', async (role) => {
    vi.mocked(getUser).mockResolvedValue({ id: role } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    const response = await GET(new Request('https://example.invalid/api/admin/api-docs/openapi'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('serves the spec only to a verified super-admin, without shared caching', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'staff' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    const response = await GET(new Request('https://example.invalid/api/admin/api-docs/openapi'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ openapi: '3.0.3' });
    expect(isSuperAdmin).toHaveBeenCalledWith('staff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
  });
  it('does not ship a static bypass around the authenticated handler', () => {
    expect(existsSync(resolve('public/openapi.json'))).toBe(false);
    expect(existsSync(resolve('public/api-docs-data.json'))).toBe(false);
  });
});
