import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn() }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async () => ({})) }));
vi.mock('@/components/api-docs/ApiDocsClient', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));
import Page from '@/app/api-docs/page';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { redirect, notFound } from 'next/navigation';

beforeEach(() => vi.clearAllMocks());
describe('API reference page authorization', () => {
  it('requires sign-in before returning client props', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(Page()).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?redirectTo=/api-docs');
  });
  it('hides the catalog from non-super-admin accounts', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-a' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    await expect(Page()).rejects.toThrow('NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
  it('returns the catalog after verifying super-admin authority', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'staff-a' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    const page = await Page();
    expect(page.props.data.totalRoutes).toBeGreaterThan(0);
    expect(isSuperAdmin).toHaveBeenCalledWith('staff-a');
  });
});
