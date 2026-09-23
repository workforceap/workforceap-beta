/**
 * Vision C4 / V12 — /partner/exports "Outcome packet" section renders the same
 * builder output the `?preset=packet` CSV prints, and keeps the partner guard.
 */
process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn() }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/partner/referralBundle', () => ({ loadPartnerReferralBundle: vi.fn(), countPartnerReferrals: vi.fn() }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  StatusTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  colorVar: () => 'inherit',
}));

import PartnerExportsPage from '@/app/(portal)/partner/exports/page';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { countPartnerReferrals, loadPartnerReferralBundle } from '@/lib/partner/referralBundle';

function row(id: string, startDateVerified: boolean | null, enrolledAt: Date | null = new Date('2026-02-01T00:00:00Z')) {
  return {
    member: {
      id,
      fullName: `Member ${id}`,
      enrolledProgram: 'it-support',
      enrolledAt,
      courseEnrollments: [],
      userCertifications: [],
      memberProgramProgress: [],
      placementRecord:
        startDateVerified === null
          ? null
          : { employerName: 'Acme', jobTitle: 'Tech', salaryOffered: 52000, placedAt: null, startDateVerified, onboardingWindowEnd: null, retentionDecision: null },
    },
    referredAt: new Date('2026-01-15T00:00:00Z'),
    stage: 'enrolled',
    programTitle: 'IT Support',
    allProgramTitles: ['IT Support'],
  };
}

const CTX = { partnerId: 'partner-1', partner: { name: 'Fixture Partner', organizationId: 'org-partner', slug: 'fixture' } };

describe('PartnerExportsPage outcome packet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'partner-user' } as never);
    vi.mocked(getPartnerForUser).mockResolvedValue(CTX as never);
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      pipelineMembers: [row('a', true), row('b', false), row('c', null, null)],
    } as never);
    vi.mocked(countPartnerReferrals).mockResolvedValue(3);
  });

  it('shows each packet line as X of N, the unknowns and the packet download, scoped to the partner org', async () => {
    const html = renderToStaticMarkup(await PartnerExportsPage());
    expect(html).toContain('Outcome packet');
    expect(html).toContain('Referred members');
    expect(html).toContain('3 of 3');
    expect(html).toContain('Placement records');
    expect(html).toContain('2 of 3');
    expect(html).toContain('Placement start date verified');
    expect(html).toContain('1 of 3');
    expect(html).toContain('Enrolled members with no enrolled date recorded: 1');
    expect(html).toContain('href="/api/partner/export/referrals?preset=packet"');
    expect(html).toMatch(/<time dateTime="\d{4}-\d{2}-\d{2}T[\d:.]+Z"/i);
    // The generated-at time is shown, because the page and the CSV read live
    // records at separate request times.
    expect(html).toMatch(/Generated at <time dateTime="\d{4}-\d{2}-\d{2}T[\d:.]+Z" data-testid="partner-outcome-packet-generated-at">/i);
    expect(html).toContain('The page and the CSV use the same definitions');
    expect(html).not.toMatch(/always match|cannot drift/i);
    // The unverified self-report counts as a placement record and is labelled pending.
    expect(html).toContain('Placement reported, pending verification');
    expect(html).toContain('recorded as an unverified placement record');
    // Credential copy names every source and status, never "member-reported".
    expect(html).toContain('Credential records (any source or review status)');
    expect(html).not.toMatch(/member-reported/i);
    const packetHtml = html.slice(html.indexOf('data-testid="partner-outcome-packet"'), html.indexOf('Download outcome packet'));
    expect(packetHtml).not.toMatch(/\d+(\.\d+)?%/);
    expect(html).not.toContain('partner-outcome-packet-truncated');
    // The three existing export tiles stay.
    expect(html).toContain('href="/api/partner/export/referrals"');
    expect(html).toContain('href="/api/partner/export/referrals?preset=outcomes"');
    expect(html).toContain('href="/api/partner/export/referrals?preset=demographics"');
    expect(loadPartnerReferralBundle).toHaveBeenCalledWith('partner-1', 'org-partner');
    expect(countPartnerReferrals).toHaveBeenCalledWith('partner-1', 'org-partner');
  });

  it('shows the truncation banner when the load is capped', async () => {
    vi.mocked(countPartnerReferrals).mockResolvedValue(612);
    const html = renderToStaticMarkup(await PartnerExportsPage());
    expect(html).toContain('partner-outcome-packet-truncated');
    expect(html).toContain('3 most recent of 612 referrals');
  });

  it('says "No referrals yet" honestly at zero', async () => {
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({ pipelineMembers: [] } as never);
    vi.mocked(countPartnerReferrals).mockResolvedValue(0);
    const html = renderToStaticMarkup(await PartnerExportsPage());
    expect(html).toContain('No referrals yet');
    expect(html).not.toContain('0 of 0');
  });

  it('(g) redirects a non-partner and reads nothing', async () => {
    vi.mocked(getPartnerForUser).mockResolvedValue(null as never);
    await expect(PartnerExportsPage()).rejects.toThrow('REDIRECT:/dashboard');
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
    expect(countPartnerReferrals).not.toHaveBeenCalled();
  });

  it('(g) redirects a signed-out visitor to login', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(PartnerExportsPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/partner/exports');
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
  });
});
