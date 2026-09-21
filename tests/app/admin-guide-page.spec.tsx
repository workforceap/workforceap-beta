import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={rest.className}>{children}</a>
  ),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: vi.fn() }));

import AdminGuidePage, { generateMetadata } from '@/app/admin/guide/page';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { ADMIN_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';

const WORKSPACE_HREFS = ['/admin', '/admin/overview', '/admin/students', '/admin/programs', '/admin/training-progress', '/admin/messages', '/admin/settings'];

describe('/admin/guide', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as never);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
  });

  it('describes the seven admin workspace areas with the sidebar labels and links', async () => {
    render(await AdminGuidePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Your admin workspace' })).toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'The workspace, part by part' });
    const items = within(map).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    const navByHref = new Map(ADMIN_PORTAL_NAV_ITEMS.map((item) => [item.href, item.label]));
    WORKSPACE_HREFS.forEach((href, index) => {
      const link = within(items[index]).getByRole('link');
      expect(link).toHaveAttribute('href', href);
      // The guide names each area exactly as the sidebar does.
      expect(link).toHaveTextContent(navByHref.get(href) ?? `missing nav item for ${href}`);
    });
  });

  it('offers the capabilities, quick actions and common questions like the counselor guide', async () => {
    render(await AdminGuidePage());
    expect(screen.getByRole('region', { name: 'What you can do here' })).toBeInTheDocument();
    const quick = screen.getByRole('region', { name: 'Quick actions' });
    expect(within(quick).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/admin/students',
      '/admin/messages',
      '/admin/program-change-requests',
      '/admin/training-progress',
    ]);
    const faq = screen.getByRole('region', { name: 'Common questions' });
    expect(within(faq).getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('link', { name: 'Back to Command Center' })).toHaveAttribute('href', '/admin');
  });

  it('sends signed-out visitors to login with a return path and non-admins to the dashboard', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(AdminGuidePage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/guide');
    vi.mocked(resolveAdminPageTenant).mockResolvedValueOnce({ ok: false });
    await expect(AdminGuidePage()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('publishes metadata for its own path', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({ path: '/admin/guide', title: 'Admin workspace guide' });
  });
});
