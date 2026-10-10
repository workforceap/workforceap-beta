import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: vi.fn() }));

import AdminBillingPreviewPage, { generateMetadata } from '@/app/admin/billing/preview/page';
import BillingMockPreview from '@/components/billing/BillingMockPreview';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as never);
  vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Admin J5 / J6 mock preview', () => {
  it('requires a signed-in admin before rendering the sample', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(AdminBillingPreviewPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/billing/preview');
    expect(resolveAdminPageTenant).not.toHaveBeenCalled();
    vi.mocked(resolveAdminPageTenant).mockResolvedValueOnce({ ok: false });
    await expect(AdminBillingPreviewPage()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('renders the sample for an organization admin without requesting a member or case', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(await AdminBillingPreviewPage());
    expect(resolveAdminPageTenant).toHaveBeenCalledWith('admin-1');
    expect(screen.getByRole('heading', { level: 1, name: 'J5 / J6 mock preview' })).toBeInTheDocument();
    expect(screen.getByText('Mock preview only — no real student or billing case')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Students' })).toHaveAttribute('href', '/admin/students');
    expect(screen.getByText('Sample Student (not a real member)')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switches unsigned PDF views with a working fallback link and no mutation requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<BillingMockPreview />);
    const j5 = screen.getByRole('button', { name: 'Preview J5' });
    const j6 = screen.getByRole('button', { name: 'Preview J6' });
    expect(j5).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('Unsigned mock J5 — Quote / Voucher Request')).toHaveAttribute('src', '/api/admin/billing/preview/j5');
    fireEvent.click(j6);
    expect(j6).toHaveAttribute('aria-pressed', 'true');
    expect(j5).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTitle('Unsigned mock J5 — Quote / Voucher Request')).not.toBeInTheDocument();
    expect(screen.getByTitle('Unsigned mock J6 — Invoice / Voucher Cover Letter')).toHaveAttribute('src', '/api/admin/billing/preview/j6');
    const link = screen.getByRole('link', { name: 'Open unsigned J6 sample PDF in a new tab' });
    expect(link).toHaveAttribute('href', '/api/admin/billing/preview/j6');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(j5);
    expect(screen.getByTitle('Unsigned mock J5 — Quote / Voucher Request')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps live creation, signing and sending unavailable in the workbench', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<BillingMockPreview />);
    const disclosure = screen.getByText('Explore the J5 / J6 workflow (read-only)').closest('details')!;
    disclosure.open = true;
    const j5 = screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' });
    const j6 = screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' });
    expect(j5).toBeDisabled();
    expect(j6).toBeDisabled();
    fireEvent.click(j5);
    fireEvent.click(j6);
    expect(screen.queryByRole('button', { name: /sign|send|upload/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('publishes metadata for the preview route', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({ path: '/admin/billing/preview', title: 'J5 / J6 mock preview' });
  });
});
