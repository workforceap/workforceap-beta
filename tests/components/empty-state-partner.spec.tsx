import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/partner/attention',
  useSearchParams: () => nav.params,
}));

import PartnerEmptyState from '@/components/partner/PartnerEmptyState';
import PartnerMembersList from '@/components/portal/PartnerMembersList';
import PartnerReferredMembersMobile from '@/components/partner/PartnerReferredMembersMobile';
import PartnerAttentionClient from '@/components/partner/PartnerAttentionClient';
import PartnerMilestonesView from '@/components/partner/PartnerMilestonesView';
import PartnerMilestonesMobile from '@/components/partner/PartnerMilestonesMobile';
import { PartnerPayoutLedger } from '@/components/portal/kit/pages/PartnerOverviewKit';
import { PARTNER_EMPTY, partnerAttentionEmptyVariant, partnerReferralsEmptyVariant, type PartnerEmptyVariant } from '@/lib/partner/emptyState';

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;

function renderIn(ui: React.ReactElement, locale: Locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>
      {ui}
    </NextIntlClientProvider>,
  );
}
const copy = (locale: Locale, group: string) =>
  (LOCALES[locale].empty as unknown as Record<string, Record<string, Record<string, string>>>).partner[group];

function emptyBox() {
  const box = screen.getByTestId('partner-empty');
  expect(box.className).toMatch(/\bwa-kit-empty\b/);
  expect(box.className).not.toMatch(/portal-empty-state/);
  expect(box.textContent).not.toMatch(/empty\.partner\./);
  return box;
}

const member = () => ({
  id: 'm-1',
  fullName: 'Ada Lovelace',
  stage: 'applied',
  stageLabel: 'Applied',
  progress: 0,
  programTitle: 'Data Analytics',
  story: '',
  referredAtLabel: '9/1/2026',
  placementVerified: null,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const attentionEnvelope = (members: unknown[] = []) => ({
  members,
  counts: { all: members.length, high: members.length, medium: 0, low: 0, watch: 0 },
  total: members.length,
  nextCursor: null,
  asOf: '2026-09-22T12:00:00.000Z',
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.params = new URLSearchParams();
});

describe('PartnerEmptyState — one component, ten situations', () => {
  const EXPECT: Record<PartnerEmptyVariant, { kind: string; tone: string; alert?: boolean; href?: string; secondary?: string }> = {
    referrals: { kind: 'first', tone: 'muted', href: '/partner/guide', secondary: '/partner/referred-members' },
    referralsFiltered: { kind: 'filtered', tone: 'muted' },
    payouts: { kind: 'first', tone: 'muted', href: '/partner/referred-members' },
    pendingReviewsClear: { kind: 'clear', tone: 'ok', href: '/partner/referred-members' },
    attentionClear: { kind: 'clear', tone: 'ok', href: '/partner/referred-members' },
    attentionFiltered: { kind: 'filtered', tone: 'muted' },
    attentionUnavailable: { kind: 'unavailable', tone: 'danger', alert: true },
    milestones: { kind: 'first', tone: 'muted', href: '/partner/referred-members' },
    milestonesPendingClear: { kind: 'clear', tone: 'ok' },
    milestonesUnavailable: { kind: 'unavailable', tone: 'danger', alert: true },
  };

  for (const locale of Object.keys(LOCALES) as Locale[]) {
    it(`${locale}: every variant renders its kind, tone, role and routes from empty.partner.*`, () => {
      for (const variant of Object.keys(PARTNER_EMPTY) as PartnerEmptyVariant[]) {
        const words = copy(locale, PARTNER_EMPTY[variant].group);
        renderIn(<PartnerEmptyState variant={variant} framed headingAs="h2" />, locale);
        const box = emptyBox();
        expect(box.dataset.variant).toBe(variant);
        expect(box.dataset.kind).toBe(EXPECT[variant].kind);
        expect(box.dataset.tone).toBe(EXPECT[variant].tone);
        expect(box.className).toMatch(/wa-kit-empty--framed/);
        expect(box.getAttribute('role')).toBe(EXPECT[variant].alert ? 'alert' : null);
        expect(within(box).getByRole('heading', { level: 2 })).toHaveTextContent(words.title);
        expect(within(box).getByText(words.body)).toBeInTheDocument();
        if (EXPECT[variant].href) {
          const link = within(box).getByRole('link', { name: words.action });
          expect(link).toHaveAttribute('href', EXPECT[variant].href);
          expect(link.className).toMatch(/\bwa-kit-cta\b/);
        } else {
          expect(within(box).queryByRole('link')).toBeNull();
        }
        if (EXPECT[variant].secondary) {
          expect(within(box).getByRole('link', { name: words.secondary })).toHaveAttribute('href', EXPECT[variant].secondary);
        }
        cleanup();
      }
    });
  }

  it('a callback variant renders its action as a button and hideSecondary drops the quiet route', () => {
    const onPrimary = vi.fn();
    renderIn(<PartnerEmptyState variant="referralsFiltered" onPrimary={onPrimary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    cleanup();
    renderIn(<PartnerEmptyState variant="referrals" hideSecondary />);
    expect(screen.getByRole('link', { name: 'Open referral guide' })).toHaveAttribute('href', '/partner/guide');
    expect(screen.queryByRole('link', { name: 'Referred members' })).toBeNull();
  });

  it('variant helpers read the loader counts', () => {
    expect(partnerReferralsEmptyVariant({ total: 0, visible: 0 })).toBe('referrals');
    expect(partnerReferralsEmptyVariant({ total: 3, visible: 0 })).toBe('referralsFiltered');
    expect(partnerReferralsEmptyVariant({ total: 3, visible: 2 })).toBeNull();
    expect(partnerAttentionEmptyVariant('all')).toBe('attentionClear');
    expect(partnerAttentionEmptyVariant('high')).toBe('attentionFiltered');
  });
});

describe('/partner/referred-members — desktop list', () => {
  it('no referrals: first state under the filter row, guide route, no invite claim', () => {
    renderIn(<PartnerMembersList members={[]} />);
    const box = emptyBox();
    expect(box.dataset.variant).toBe('referrals');
    expect(box.dataset.kind).toBe('first');
    expect(screen.getByRole('heading', { level: 3, name: 'No referred members yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open referral guide' })).toHaveAttribute('href', '/partner/guide');
    expect(screen.queryByRole('link', { name: 'Referred members' })).toBeNull();
    expect(screen.queryByText(/haven't referred|Invite Member button/)).toBeNull();
    expect(screen.getByText('0 members shown')).toBeInTheDocument();
  });

  it('stage filter miss: filtered state whose Clear filters resets search and stage and brings the rows back', () => {
    renderIn(<PartnerMembersList members={[member()]} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by member journey stage'), { target: { value: 'placed' } });
    fireEvent.change(screen.getByLabelText('Search referred members by name, program, or status'), { target: { value: 'zzz' } });
    const box = emptyBox();
    expect(box.dataset.variant).toBe('referralsFiltered');
    expect(box.dataset.kind).toBe('filtered');
    expect(screen.getByRole('heading', { level: 3, name: 'No members match this filter' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByTestId('partner-empty')).toBeNull();
    expect((screen.getByLabelText('Filter by member journey stage') as HTMLSelectElement).value).toBe('all');
  });
});

describe('/partner/referred-members and the overview — phone card list', () => {
  it('no referrals: first state, framed, no card wrapper', () => {
    renderIn(<PartnerReferredMembersMobile rows={[]} />);
    const box = emptyBox();
    expect(box.dataset.variant).toBe('referrals');
    expect(box.className).toMatch(/wa-kit-empty--framed/);
    expect(box.parentElement?.className ?? '').not.toMatch(/wa-kit-card/);
    expect(screen.getByRole('link', { name: 'Open referral guide' })).toHaveAttribute('href', '/partner/guide');
  });

  it('chip miss: filtered state whose Clear filters returns to All', () => {
    renderIn(<PartnerReferredMembersMobile rows={[member()]} />);
    fireEvent.click(screen.getByRole('button', { name: /^Placed/ }));
    const box = emptyBox();
    expect(box.dataset.variant).toBe('referralsFiltered');
    expect(screen.getByRole('heading', { level: 3, name: 'No members match this filter' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('/partner/attention — queue states follow the API answer', () => {
  function stubAttention(queue: (url: string) => Response | Promise<Response>) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('needs-attention')) return queue(url);
      if (url.endsWith('/outreach')) return json({ logs: [] });
      if (url.endsWith('/referral-members')) return json({ members: [] });
      if (url.endsWith('/team-assign')) return json({ users: [] });
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('zero rows under All is the goal: clear/ok, no alert', async () => {
    stubAttention(() => json(attentionEnvelope()));
    nav.params = new URLSearchParams('tier=all');
    renderIn(<PartnerAttentionClient initialTier="all" />);
    await screen.findByTestId('partner-empty');
    const box = emptyBox();
    expect(box.dataset.variant).toBe('attentionClear');
    expect(box.dataset.kind).toBe('clear');
    expect(box.dataset.tone).toBe('ok');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'No members need attention' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Referred members' })).toHaveAttribute('href', '/partner/referred-members');
  });

  it('zero rows under one tier is a filter miss: Show all tiers routes to All', async () => {
    stubAttention(() => json(attentionEnvelope()));
    renderIn(<PartnerAttentionClient initialTier="high" />);
    await screen.findByTestId('partner-empty');
    const box = emptyBox();
    expect(box.dataset.variant).toBe('attentionFiltered');
    expect(box.dataset.kind).toBe('filtered');
    fireEvent.click(screen.getByRole('button', { name: 'Show all tiers' }));
    expect(nav.replace).toHaveBeenCalledWith('/partner/attention?tier=all', { scroll: false });
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('a failed read is unavailable/danger with role=alert and Try again refetches', async () => {
    let calls = 0;
    const fetchMock = stubAttention(() => {
      calls += 1;
      return calls === 1 ? json({ error: 'boom' }, 500) : json(attentionEnvelope());
    });
    nav.params = new URLSearchParams('tier=all');
    renderIn(<PartnerAttentionClient initialTier="all" />);
    const alert = await screen.findByRole('alert');
    expect(alert.dataset.variant).toBe('attentionUnavailable');
    expect(alert.dataset.kind).toBe('unavailable');
    expect(alert.dataset.tone).toBe('danger');
    expect(within(alert).getByRole('heading', { level: 3 })).toHaveTextContent("Couldn't load the attention queue");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('partner-empty').dataset.variant).toBe('attentionClear'));
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('needs-attention'))).toHaveLength(2);
  });
});

describe('/partner/milestones — list states follow /api/partner/milestones', () => {
  it('desktop: zero milestones is first with the referred-members route; a failed read is an alert whose Try again refetches', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? json({ error: 'down' }, 500) : json({ milestones: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderIn(<PartnerMilestonesView />);
    const alert = await screen.findByRole('alert');
    expect(alert.dataset.variant).toBe('milestonesUnavailable');
    expect(alert.dataset.tone).toBe('danger');
    expect(within(alert).getByRole('heading', { level: 3 })).toHaveTextContent("Couldn't load milestones");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('partner-empty').dataset.variant).toBe('milestones'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { level: 3, name: 'No milestones yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Referred members' })).toHaveAttribute('href', '/partner/referred-members');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('phone: activity-only milestones leave the pending queue clear/ok under its h4', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ milestones: [{ id: 'e1', kind: 'event', label: 'Logged in', memberId: 'm-1', memberName: 'Ada Lovelace', at: '2026-09-20T10:00:00.000Z' }] })));
    renderIn(<PartnerMilestonesMobile />);
    await screen.findByTestId('partner-empty');
    const box = emptyBox();
    expect(box.dataset.variant).toBe('milestonesPendingClear');
    expect(box.dataset.kind).toBe('clear');
    expect(within(box).getByRole('heading', { level: 4 })).toHaveTextContent('No milestones pending review');
    expect(within(box).queryByRole('link')).toBeNull();
    expect(within(box).queryByRole('button')).toBeNull();
  });

  it('phone: zero milestones is first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ milestones: [] })));
    renderIn(<PartnerMilestonesMobile />);
    await screen.findByTestId('partner-empty');
    expect(emptyBox().dataset.variant).toBe('milestones');
  });
});

describe('/partner overview — payout ledger', () => {
  it('no payout events: first state naming the verification step, no promise of timing', () => {
    renderIn(<PartnerPayoutLedger rows={[]} />);
    const box = emptyBox();
    expect(box.dataset.variant).toBe('payouts');
    expect(box.dataset.kind).toBe('first');
    expect(screen.getByRole('heading', { level: 3, name: 'No payouts yet' })).toBeInTheDocument();
    expect(box.textContent).toMatch(/verifies a placement/);
    expect(box.textContent).not.toMatch(/will appear here/);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('retired partner.* empty copy', () => {
  it('the nine keys the migrated surfaces read are gone from every locale', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const partner = (messages as { partner: Record<string, unknown> }).partner;
      for (const key of ['noReferredMembersYet', 'openReferralGuide', 'sendApplicantsTo', 'noMembersYet', 'noMembersYetDescription', 'noMembersMatchFilter', 'noMembersInFilter', 'noMilestonesYet', 'noMilestonesYetDescription']) {
        expect(partner[key], `${locale} partner.${key}`).toBeUndefined();
      }
    }
  });
});
