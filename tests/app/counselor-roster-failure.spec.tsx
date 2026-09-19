import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ load: vi.fn(), redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin' }) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }), withAdminPageScope: async (_scope: unknown, work: (db: object) => unknown) => work({}) }));
vi.mock('@/lib/admin/counselorRoster', () => ({ loadCounselorRoster: mocks.load, parseCounselorRosterQuery: () => ({ page: 1, search: '' }), COUNSELOR_PAGE_SIZE: 50 }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/admin/AdminCounselorsClient', () => ({ default: () => <div>Legacy management</div> }));
vi.mock('@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit', () => ({ CounselorsRosterKit: () => <div>Reporting totals</div> }));
import AdminCounselorsPage from '@/app/admin/counselors/page';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('counselor reporting load failure', () => {
  it('keeps failure visible to people and the audit without redirecting to a false successful fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.load.mockRejectedValueOnce(new Error('fixture database failure'));
    const { container } = render(await AdminCounselorsPage({}));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(container.querySelector('[data-portal-error-state="admin-counselors-assignment-load"]')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('No reporting totals are shown');
    expect(screen.queryByText('Reporting totals')).toBeNull();
    expect(screen.getByRole('link', { name: 'Try loading the roster again' })).toHaveAttribute('href', '/admin/counselors');
    expect(screen.getByRole('link', { name: 'Open counselor management' })).toHaveAttribute('href', '/admin/counselors?ui=legacy');
  });
});
