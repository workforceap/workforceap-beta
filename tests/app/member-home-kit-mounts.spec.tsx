import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * WAP-194: the four owner-approved pieces the `?ui=legacy` home owned are
 * mounted on the default kit `/dashboard`, each under the same condition the
 * legacy home used:
 *   - the first-login wizard while `onboardingCompletedAt` is unset, and the
 *     first-visit tour auto-start once after it, never while
 *     `guided_tours_v2` owns the tour (so two tours never start);
 *   - the app-install prompt, always mounted (it shows itself);
 *   - the view-only program switch, fed by `?program=` through the loader;
 *   - the staff-view banner for `canBypassMemberAssessment` viewers.
 * The page is rendered for real; the loader, the role checks and the tour
 * flag are the seams.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  canBypassMemberAssessment: vi.fn(async () => false),
  getProfileRole: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/member/ensureAppUser', () => ({ ensureAppUserProvisioned: vi.fn() }));
vi.mock('@/lib/member/loadMemberDashboardHome', () => ({ loadMemberDashboardHome: vi.fn() }));
vi.mock('@/lib/member/counselorContext', () => ({ getApprovalWaitEstimate: vi.fn(async () => ({ medianDays: 4, sampleSize: 9 })), getMemberCounselorContext: vi.fn() }));
vi.mock('@/lib/tours/getTourOffer', () => ({ getTourOffer: vi.fn() }));
vi.mock('@/components/portal/MemberApprovalStatusCard', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/member/MemberHomeViewEvents', () => ({ MemberHomeViewEvents: () => null }));
vi.mock('@/components/portal/kit/pages/member/MemberHomeKit', () => ({
  MemberHomeKit: vi.fn(() => <div data-testid="member-home-kit" />),
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({
  default: vi.fn(() => <div data-testid="portal-entry" />),
}));
vi.mock('@/components/pwa/PWAInstallPrompt', () => ({ default: () => <div data-testid="pwa-install-prompt" /> }));

import DashboardPage from '@/app/(portal)/dashboard/page';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { getUser } from '@/lib/auth/server';
import { canBypassMemberAssessment, isSuperAdmin } from '@/lib/auth/roles';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { MEMBER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';

const WIZARD = {
  initialFullName: 'Maya Lopez',
  initialPhone: '5125550100',
  initialAddress: '1 Main St',
  initialCity: 'Austin',
  initialState: 'TX',
  initialZip: '78701',
  initialProgramInterest: 'IT Support',
  initialReferralSource: 'Friend',
  initialStep: 1,
};

const PROGRAM_SWITCH = {
  options: [
    { id: 'e1', programSlug: 'aws-cloud-technology-amazon', programTitle: 'AWS Cloud Technology Certificate', isPrimary: true },
    { id: 'e2', programSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+', isPrimary: false },
  ],
  activeProgramSlug: 'comptia-a-professional-certificate',
  viewingSecondary: true,
};

function homeView(overrides: Record<string, unknown> = {}) {
  return {
    approvalStatus: {} as never,
    counselorContext: {
      counselor: { name: 'Dana Reyes', firstName: 'Dana', messagingHref: '/dashboard/messages' },
      waitEstimate: null,
      awaiting: 'approval',
    },
    organizationId: 'org-1',
    firstName: 'Maya',
    coursePercent: 0,
    goals: [],
    pipeline: [],
    pointsLedger: [],
    upNext: [],
    doThisNext: null,
    recommendedTool: null,
    jobOffers: [],
    first90: null,
    youthNoticeAge: null,
    dashboardViewFacts: null,
    onboarding: { showWizard: true, showTour: false, wizard: WIZARD },
    programSwitch: null,
    prismaOpCount: 1,
    ...overrides,
  } as never;
}

async function renderDashboard(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {await DashboardPage({ searchParams: Promise.resolve(searchParams) })}
    </NextIntlClientProvider>,
  );
}

/** Props of the last PortalEntryClient / MemberHomeKit render. */
const entryProps = () => vi.mocked(PortalEntryClient).mock.calls.at(-1)?.[0] as unknown as Record<string, unknown> | undefined;
const kitProps = () => vi.mocked(MemberHomeKit).mock.calls.at(-1)?.[0] as unknown as Record<string, unknown>;

describe('kit /dashboard mounts the four WAP-194 pieces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1', email: 'maya@example.org' } as never);
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView());
    vi.mocked(getTourOffer).mockResolvedValue({ key: 'member.home', enabled: false, offer: false });
    vi.mocked(canBypassMemberAssessment).mockResolvedValue(false);
    vi.mocked(isReadOnlyPortalAuditHeader).mockReturnValue(false);
  });

  it('opens the onboarding wizard while onboarding is not done, fed by the loader read and the approval card\'s counselor', async () => {
    const html = await renderDashboard();
    expect(html).toContain('data-testid="member-home-kit"');
    expect(html).toContain('data-testid="portal-entry"');
    const props = entryProps();
    expect(props).toMatchObject({
      portal: 'member',
      tourStorageUserId: 'member-1',
      showOnboardingWizard: true,
      showTour: false,
      readOnlyAudit: false,
      isSuperAdmin: false,
      tourSteps: MEMBER_PORTAL_TOUR_STEPS,
    });
    expect(props?.wizardProps).toEqual({
      ...WIZARD,
      counselor: { firstName: 'Dana', messagingHref: '/dashboard/messages' },
      // The measured wait the approval card also shows (read only while the application is under review).
      waitEstimate: { medianDays: 4, sampleSize: 9 },
    });
    // The tour flag is not read while the wizard is the first-login step.
    expect(getTourOffer).not.toHaveBeenCalled();
    // The wizard sits beside the home, not around it: a wizard crash cannot take the home down.
    expect(html.indexOf('data-testid="portal-entry"')).toBeLessThan(html.indexOf('data-testid="member-home-kit"'));
  });

  it('auto-starts the first-visit tour once onboarding is done and guided_tours_v2 is off', async () => {
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ onboarding: { showWizard: false, showTour: true, wizard: WIZARD } }));
    await renderDashboard();
    expect(getTourOffer).toHaveBeenCalledWith('member-1', 'member.home');
    expect(entryProps()).toMatchObject({ showOnboardingWizard: false, showTour: true });
  });

  it('never starts a second tour: with guided_tours_v2 on, the shell owns the tour and nothing auto-starts', async () => {
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ onboarding: { showWizard: false, showTour: true, wizard: WIZARD } }));
    vi.mocked(getTourOffer).mockResolvedValue({ key: 'member.home', enabled: true, offer: true });
    const html = await renderDashboard();
    expect(PortalEntryClient).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="portal-entry"');
  });

  it('mounts no first-login guidance once both are done, or without a member row', async () => {
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ onboarding: { showWizard: false, showTour: false, wizard: WIZARD } }));
    await renderDashboard();
    expect(PortalEntryClient).not.toHaveBeenCalled();
    expect(getTourOffer).not.toHaveBeenCalled();

    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ onboarding: null }));
    await renderDashboard();
    expect(PortalEntryClient).not.toHaveBeenCalled();
  });

  it('suppresses wizard persistence for a read-only portal audit, as the legacy mount did', async () => {
    vi.mocked(isReadOnlyPortalAuditHeader).mockReturnValue(true);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    await renderDashboard();
    expect(entryProps()).toMatchObject({ readOnlyAudit: true, isSuperAdmin: true });
  });

  it('always mounts the app-install prompt on the kit path', async () => {
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ onboarding: null }));
    const html = await renderDashboard();
    expect(html).toContain('data-testid="pwa-install-prompt"');
  });

  it('shows the staff-view banner only when canBypassMemberAssessment is true, and survives a failed role read', async () => {
    await renderDashboard();
    expect(kitProps().showStaffViewBanner).toBe(false);

    vi.mocked(canBypassMemberAssessment).mockResolvedValue(true);
    await renderDashboard();
    expect(kitProps().showStaffViewBanner).toBe(true);

    vi.mocked(canBypassMemberAssessment).mockRejectedValue(new Error('roles down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = await renderDashboard();
    expect(kitProps().showStaffViewBanner).toBe(false);
    expect(html).toContain('data-testid="member-home-kit"');
    errorSpy.mockRestore();
  });

  it('hands ?program= to the loader and the loader\'s switch to the kit home', async () => {
    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView({ programSwitch: PROGRAM_SWITCH }));
    await renderDashboard({ program: '  comptia-a-professional-certificate ' });
    expect(vi.mocked(loadMemberDashboardHome).mock.calls[0]?.[0]).toMatchObject({
      userId: 'member-1',
      requestedProgramSlug: 'comptia-a-professional-certificate',
    });
    expect(kitProps().programSwitch).toEqual(PROGRAM_SWITCH);

    vi.mocked(loadMemberDashboardHome).mockResolvedValue(homeView());
    await renderDashboard();
    expect(vi.mocked(loadMemberDashboardHome).mock.calls.at(-1)?.[0]).toMatchObject({ requestedProgramSlug: null });
    expect(kitProps().programSwitch).toBeNull();
  });
});
