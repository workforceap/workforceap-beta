import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PartnerSignupRequest } from '@prisma/client';

const state = vi.hoisted(() => ({
  user: { id: 'staff-1' } as { id: string } | null,
  superAdmin: true,
  findMany: vi.fn(), count: vi.fn(), partnerLookup: vi.fn(), memberLookup: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => state.user }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: async () => state.superAdmin }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => unknown) => fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partnerSignupRequest: { findMany: state.findMany, count: state.count },
  partner: { findMany: state.partnerLookup, findFirst: state.partnerLookup },
  user: { findMany: state.memberLookup, findFirst: state.memberLookup },
} }));

import PartnerSignupsPage from '@/app/admin/partner-signups/page';

const records: PartnerSignupRequest[] = Array.from({ length: 30 }, (_, index) => ({
  id: `signup-${index}`, organizationName: index === 29 ? 'Foreign organization name' : `Organization ${index}`,
  contactName: `Contact ${index}`, contactEmail: index === 29 ? 'same-as-existing-partner@example.invalid' : `contact${index}@example.invalid`,
  contactPhone: index === 29 ? '5125550123' : null, orgType: index === 29 ? 'Nonprofit' : 'Workforce center',
  expectedMonthly: index === 29 ? '10–20' : null, serveArea: index === 29 ? 'Submitted service area' : null,
  hearAbout: index === 29 ? '<script>Submitted referral source</script>' : null,
  status: index === 29 ? 'self_service_created' : 'pending', createdAt: new Date(Date.UTC(2026, 9, 15, 12, index)),
}));

beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: 'staff-1' }; state.superAdmin = true;
  state.findMany.mockImplementation(async ({ skip, take }: { skip: number; take: number }) =>
    [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(skip, skip + take));
  state.count.mockResolvedValue(records.length);
});

describe('platform partner signup intake', () => {
  it('guards anonymous requests before any intake read', async () => {
    state.user = null;
    await expect(PartnerSignupsPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/partner-signups');
    expect(state.findMany).not.toHaveBeenCalled(); expect(state.count).not.toHaveBeenCalled();
  });

  it('denies ordinary organization admins and every non-superadmin before reading unassociated submissions', async () => {
    state.superAdmin = false;
    await expect(PartnerSignupsPage()).rejects.toThrow('REDIRECT:/admin/partners');
    expect(state.findMany).not.toHaveBeenCalled(); expect(state.count).not.toHaveBeenCalled();
  });

  it('shows original platform-wide intake fields with no account/name/email association or approval actions', async () => {
    render(await PartnerSignupsPage());
    expect(screen.getAllByRole('row')).toHaveLength(26);
    const body = screen.getAllByRole('row')[1];
    expect(body).toHaveTextContent('Foreign organization name');
    for (const text of ['Contact 29', 'same-as-existing-partner@example.invalid', '5125550123', 'Nonprofit', '10–20', 'Submitted service area', 'Submitted referral source', 'self_service_created']) {
      expect(body).toHaveTextContent(text);
    }
    expect(document.querySelector('script')).toBeNull();
    expect(state.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 25, skip: 0 });
    expect(state.count).toHaveBeenCalledWith();
    expect(state.partnerLookup).not.toHaveBeenCalled(); expect(state.memberLookup).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/admin/partner-signups?page=2');
  });

  it('paginates the bounded newest-first query without duplicating the first page', async () => {
    render(await PartnerSignupsPage({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(state.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 25 }));
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(screen.queryByText('Foreign organization name')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/admin/partner-signups?page=1');
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it.each(['-1', '1.5', 'Infinity', 'bad'])('normalizes invalid page %s to the first bounded read', async (page) => {
    await PartnerSignupsPage({ searchParams: Promise.resolve({ page }) });
    expect(state.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 0 }));
  });

  it('caps an excessive page number', async () => {
    await PartnerSignupsPage({ searchParams: Promise.resolve({ page: '100000000' }) });
    expect(state.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 249975 }));
  });

  it('shows a load failure without claiming intake is empty', async () => {
    state.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    render(await PartnerSignupsPage());
    expect(screen.getByText('Could not load partner signup intake')).toBeInTheDocument();
    expect(screen.queryByText('No partner signup submissions')).not.toBeInTheDocument();
  });
});
