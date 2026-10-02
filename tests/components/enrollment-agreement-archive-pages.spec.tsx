import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: mocks.scope }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/enrollment/EnrollmentAgreementArchiveClient', () => ({ default: () => <section aria-label="Retained agreement archive" /> }));
vi.mock('@/components/enrollment/EnrollmentAgreementCoverageClient', () => ({ default: () => <section aria-label="Agreement coverage" /> }));
import ArchivePage from '@/app/admin/enrollment-agreements/archive/page';
import CoveragePage from '@/app/admin/enrollment-agreements/page';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
  mocks.user.mockResolvedValue({ id: 'staff' }); mocks.scope.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('agreement archive page access', () => {
  it('keeps the archive link visible while collection is disabled', async () => {
    render(await CoveragePage());
    expect(screen.getByRole('link', { name: 'Agreement archive' })).toHaveAttribute('href', '/admin/enrollment-agreements/archive');
    expect(screen.getByText(/tracking is not enabled/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agreement coverage' })).not.toBeInTheDocument();
  });

  it('renders the authorized archive with collection disabled', async () => {
    render(await ArchivePage());
    expect(screen.getByRole('heading', { name: 'Enrollment agreement archive' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Retained agreement archive' })).toBeInTheDocument();
    expect(mocks.scope).toHaveBeenCalledExactlyOnceWith('staff');
  });

  it('does not render the archive for a signed-out or non-admin account', async () => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(ArchivePage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/enrollment-agreements/archive');
    expect(mocks.scope).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValueOnce({ ok: false });
    await expect(ArchivePage()).rejects.toThrow('REDIRECT:/dashboard');
  });
});
