process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn() }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/partner/referralBundle', () => ({ loadPartnerReferralBundle: vi.fn() }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({ PartnerKpiGrid: () => null }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  StatusTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  colorVar: () => 'inherit',
  DataTable: ({ rows }: { rows: Array<{ id: string; submittedLabel: string }> }) => (
    <ul>{rows.map((r) => <li key={r.id}>{r.submittedLabel}</li>)}</ul>
  ),
}));

import PartnerOutcomesPage from '@/app/(portal)/partner/outcomes/page';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

describe('PartnerOutcomesPage pending-review dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'partner-user' } as never);
    vi.mocked(getPartnerForUser).mockResolvedValue({
      partnerId: 'partner-1', partner: { name: 'Synthetic Community', organizationId: 'org-1' },
    } as never);
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      members: [{ id: 'member-1', fullName: 'Fixture Member', placementRecord: null, userCertifications: [] }],
      pipelineMembers: [],
      pendingPlacements: [{ userId: 'member-1', createdAt: INSTANT }],
    } as never);
  });

  it('shows the submitted date on the Central calendar day', async () => {
    const html = renderToStaticMarkup(await PartnerOutcomesPage({}));
    expect(html).toContain('Sep 18, 2026');
    expect(html).not.toContain('9/19/2026');
  });
});
