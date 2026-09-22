import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

const routerPush = vi.fn();
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/counselor/students',
  useSearchParams: () => new URLSearchParams(),
}));
// Server pages: auth, DB and loaders are stubbed; translations are the real en.json.
const db = vi.hoisted(() => {
  const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
  const defaultFor = (method: string) => async () =>
    method === 'count' ? 0 : method === 'findMany' || method === 'groupBy' ? [] : null;
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({}, { get: (_m, method: string) => (args: unknown) => (overrides[`${model}.${method}`] ?? defaultFor(method))(args) }),
  });
  return { prisma, overrides };
});
const auth = vi.hoisted(() => ({ isAdmin: vi.fn(async () => false), isCounselor: vi.fn(async () => true) }));
const workQueue = vi.hoisted(() => ({
  rows: vi.fn(async (): Promise<unknown[]> => []),
  context: vi.fn(async (): Promise<{ flaggedTotal: number; awaitingReply: number } | null> => ({ flaggedTotal: 0, awaitingReply: 0 })),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => auth);
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/counselor/counselorStudentsRoster', () => ({ loadCounselorRosterRiskAndActivity: vi.fn(async () => new Map()) }));
vi.mock('@/lib/attention/loadFacts', () => ({ loadAttentionFacts: vi.fn(async () => []) }));
vi.mock('@/lib/attention/evaluate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/attention/evaluate')>()),
  buildAttentionQueue: vi.fn(() => ({ members: [], onTrack: [], totals: {} })),
  selectByReason: vi.fn(() => []),
}));
vi.mock('@/lib/counselor/rosterStats', () => ({ ROSTER_STAT_LOOKBACK_DAYS: 30, buildCounselorRosterStats: vi.fn(() => []) }));
vi.mock('@/lib/counselor/workQueue', () => ({
  getCounselorWorkQueue: workQueue.rows,
  getCounselorWorkQueueContext: workQueue.context,
  formatTimeWaiting: (h: number) => `${h}h ago`,
  previewMessageBody: (b: string) => b,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string, values?: Record<string, string | number>) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') return `${ns}.${key}`;
    return node
      .replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, name, one, other) => {
        const n = Number(values?.[name] ?? 0);
        return (n === 1 ? one : other).replace('#', String(n));
      })
      .replace(/\{(\w+)\}/g, (_m, name) => String(values?.[name] ?? `{${name}}`));
  }),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/counselor/CounselorRosterStats', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({ default: () => <div>chat</div> }));

import CounselorRosterEmpty from '@/components/portal/counselor/CounselorRosterEmpty';
import CounselorStudentsRosterClient, { type CounselorRosterClientRow } from '@/components/portal/counselor/CounselorStudentsRosterClient';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import CounselorMessagesInboxClient from '@/components/portal/CounselorMessagesInboxClient';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { emptyApprovalQueue } from '@/lib/counselor/approvalQueue';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { toTodayQueue } from '@/lib/attention/counselorViews';
import { ATTENTION_REASON_META } from '@/lib/attention/reasons';
import type { AtRiskMember } from '@/lib/member/atRiskRow';
import CounselorStudentsPage from '@/app/(portal)/counselor/students/page';
import CounselorWorkQueuePage from '@/app/(portal)/counselor/queue/page';
import PlacementsPage from '@/app/(portal)/counselor/placements/page';
import InactiveMembersPage from '@/app/(portal)/counselor/inactive-members/page';

/**
 * PR 5 of the empty-state consolidation (KIT_GUIDE §6): every counselor
 * empty state renders through KitEmptyState with a `kind` that follows the
 * loader's row rule and copy from `empty.counselor.*`:
 *  - no assigned members (roster, inbox) is `unavailable` — an admin assigns,
 *    so there is no first step for the counselor; an admin without a counselor
 *    row gets the same kind and the admin members route
 *  - a chip / search that matched none of the rows is `filtered` + Clear
 *  - zero is the goal for at-risk cases, inactive members, the reply queue
 *    and the approval queue: `clear`
 *  - a failed read is `unavailable` + danger, role="alert", with a retry —
 *    never "No placements yet"
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function portal(locale: Locale, ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>{ui}</NextIntlClientProvider>);
}
function emptyOf(root: ParentNode, kind: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.wa-kit-empty[data-kind="${kind}"]`);
  expect(el, `a KitEmptyState with data-kind="${kind}"`).not.toBeNull();
  return el as HTMLElement;
}
function noLegacyEmpty(root: ParentNode) {
  expect(root.querySelector('.portal-empty-state')).toBeNull();
  expect(root.textContent).not.toMatch(RAW_KEY);
}
function link(root: HTMLElement, name: string, href: string) {
  const a = within(root).getByRole('link', { name });
  expect(a).toHaveAttribute('href', href);
  expect(a.className).toContain('wa-kit-cta');
  return a;
}

const rosterRow = (id: string, riskScore: number | null): CounselorRosterClientRow => ({
  assignmentId: `a-${id}`, memberId: id, fullName: `Member ${id}`, email: `${id}@example.test`,
  enrolledProgram: null, curriculumVersion: null, programInterest: null, assessmentScorePct: null,
  wioaReviewStatus: null, memberProgramProgress: [], riskScore, riskLevel: 'LOW', lastActivityAt: null,
});

describe('CounselorRosterEmpty (students + overview)', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: no assignments is unavailable/info with the guide and resources routes', (locale) => {
    const { container } = portal(locale, <CounselorRosterEmpty variant="unassigned" headingAs="h2" />);
    const empty = emptyOf(container, 'unavailable');
    const m = LOCALES[locale].empty.counselor.roster;
    expect(empty.dataset.tone).toBe('info');
    expect(empty).not.toHaveAttribute('role');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(m.title);
    expect(within(empty).getByText(m.body).className).toContain('wa-kit-lede');
    link(empty, m.action, '/counselor/guide');
    expect(link(empty, m.secondary, '/counselor/resources').className).toContain('wa-kit-cta--ghost');
    expect(within(empty).queryByRole('link', { name: /mailto|Contact Admin/i })).toBeNull();
    noLegacyEmpty(container);
  });

  it('an admin without a counselor row is told why the roster is empty and routed to admin members', () => {
    const { container } = portal('en', <CounselorRosterEmpty variant="noCounselorRecord" headingAs="h4" />);
    const empty = emptyOf(container, 'unavailable');
    expect(within(empty).getByRole('heading', { level: 4 })).toHaveTextContent('No counselor record for your account');
    expect(empty.textContent).not.toMatch(/once an admin assigns them to you/);
    link(empty, 'Open admin members', '/admin/members');
  });
});

describe('/counselor/students page', () => {
  it('a counselor with no active assignments sees the roster state once per breakpoint, as h2 under the h1', async () => {
    db.overrides['counselor.findFirst'] = async () => ({ id: 'c-1', userId: 'staff-1', active: true });
    const { container } = portal('en', <>{await CounselorStudentsPage({ searchParams: Promise.resolve({}) })}</>);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="counselor-roster-empty"]');
    expect(empties).toHaveLength(2);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('unavailable');
      expect(empty.dataset.variant).toBe('unassigned');
      expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No members assigned yet');
      link(empty, 'Open the counselor guide', '/counselor/guide');
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.counselor.myMembersTitle);
    expect(container.querySelectorAll('h3')).toHaveLength(0);
    noLegacyEmpty(container);
  });

  it('an admin viewer without a counselor row gets the no-counselor-record variant', async () => {
    db.overrides['counselor.findFirst'] = async () => null;
    auth.isAdmin.mockResolvedValue(true);
    const { container } = portal('en', <>{await CounselorStudentsPage({ searchParams: Promise.resolve({}) })}</>);
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="counselor-roster-empty"]');
    expect(empties).toHaveLength(2);
    expect(empties[0].dataset.variant).toBe('noCounselorRecord');
    link(empties[0], 'Open admin members', '/admin/members');
    auth.isAdmin.mockResolvedValue(false);
  });
});

describe('CounselorStudentsRosterClient — chip matched nobody', () => {
  it('the at-risk chip over an all-low roster is filtered with the risk-threshold sentence and a clear action', () => {
    const { container } = portal('en', <CounselorStudentsRosterClient rows={[rosterRow('a', 5), rosterRow('b', null)]} filterMeta={[]} initialFilter="at-risk" />);
    const empty = emptyOf(container, 'filtered');
    expect(empty.dataset.tone).toBe('muted');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent('No at-risk members in your roster');
    expect(within(empty).getByText(/below the medium risk threshold, or the risk scan has not run yet/)).toBeInTheDocument();
    const clear = within(empty).getByRole('button', { name: 'Clear filter' });
    expect(clear.className).toContain('wa-kit-cta');
    fireEvent.click(clear);
    expect(routerPush).toHaveBeenCalledWith('/counselor/students');
    expect(container.querySelector('table')).toBeNull();
    noLegacyEmpty(container);
  });

  it('the pending-application chip names the decision rule, not "completed or reviewed"', () => {
    const { container } = portal('en', <CounselorStudentsRosterClient rows={[rosterRow('a', 5)]} filterMeta={[{ memberId: 'a', atRisk: false, upcomingSession: false, pendingApplication: false }]} initialFilter="pending-application" />);
    const empty = emptyOf(container, 'filtered');
    expect(within(empty).getByRole('heading')).toHaveTextContent('No applications awaiting a decision');
    expect(container.textContent).not.toMatch(/completed or had their applications reviewed/);
  });

  it('with rows and no filter the table renders and no empty state does', () => {
    const { container } = portal('en', <CounselorStudentsRosterClient rows={[rosterRow('a', 5)]} filterMeta={[]} />);
    expect(container.querySelector('.wa-kit-empty')).toBeNull();
    expect(screen.getAllByText('Member a').length).toBeGreaterThan(0);
  });
});

const atRiskMember = (id: string): AtRiskMember => ({
  userId: id, alertId: `alert-${id}`, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
  score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
  enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z', lastActivityAt: null,
});

describe('AtRiskDashboard', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: zero saved cases is clear/ok with the attention rule interpolated and two routes', (locale) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    const { container } = portal(locale, <AtRiskDashboard initialMembers={[]} />);
    const empty = emptyOf(container, 'clear');
    const m = LOCALES[locale].empty.counselor.atRiskClear;
    expect(empty.dataset.tone).toBe('ok');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.title);
    const meta = ATTENTION_REASON_META.risk_alert;
    expect(empty.textContent).toContain(meta.label.toLowerCase());
    expect(empty.textContent).toContain(meta.definition.toLowerCase());
    expect(empty.textContent).not.toMatch(/\{reason\}|\{definition\}/);
    link(empty, m.action, '/counselor');
    link(empty, m.secondary, '/counselor/students');
    expect(container.querySelector('.wa-kit-empty[data-kind="filtered"]')).toBeNull();
    noLegacyEmpty(container);
  });

  it('a failed server load is unavailable/danger, announced as an alert, with Try again and Back to Today', () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    const { container } = portal('en', <AtRiskDashboard initialMembers={[]} initialError="We could not load at-risk members right now." />);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent("We couldn't load at-risk members");
    expect(within(empty).getByText('We could not load at-risk members right now.')).toBeInTheDocument();
    expect(within(empty).getByRole('button', { name: 'Try again' }).className).toContain('wa-kit-cta');
    link(empty, 'Back to Today', '/counselor');
    expect(container.querySelector('.wa-kit-empty[data-kind="clear"]')).toBeNull();
  });

  it('a search that matches nobody is filtered with Clear filters, and clearing brings the rows back', async () => {
    const { container } = portal('en', <AtRiskDashboard initialMembers={[atRiskMember('a')]} />);
    fireEvent.change(screen.getByPlaceholderText('Search by name or email…'), { target: { value: 'zzz-nobody' } });
    const empty = emptyOf(container, 'filtered');
    expect(within(empty).getByRole('heading')).toHaveTextContent('No at-risk members match your filters');
    expect(empty.textContent).not.toMatch(/check back/i);
    fireEvent.click(within(empty).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(container.querySelector('.wa-kit-empty')).toBeNull());
    expect(screen.getByRole('button', { name: 'Member a' })).toBeInTheDocument();
  });
});

describe('Counselor Today — approval queue', () => {
  const attention = toTodayQueue(emptyAttentionQueue());

  it('an empty queue is clear/ok and keeps "Nothing is waiting on you"', () => {
    render(<CounselorTodayKit queue={attention} approvals={emptyApprovalQueue()} />);
    const section = screen.getByTestId('today-approval-queue');
    const empty = emptyOf(section, 'clear');
    expect(empty.dataset.tone).toBe('ok');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent('Nothing is waiting on you');
    expect(empty).not.toHaveAttribute('role');
  });

  it('a failed load is unavailable/danger with role=alert and a Retry link to Today', () => {
    render(<CounselorTodayKit queue={attention} approvals={emptyApprovalQueue()} approvalsLoadError />);
    const section = screen.getByTestId('today-approval-queue');
    const empty = emptyOf(section, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent("Couldn't load the approval queue");
    link(empty, 'Retry', '/counselor/today');
    expect(section.querySelector('.wa-kit-empty[data-kind="clear"]')).toBeNull();
  });
});

describe('/counselor/queue page', () => {
  async function page() {
    return portal('en', <>{await CounselorWorkQueuePage()}</>);
  }

  it('nothing waiting and nothing else flagged: clear/ok "All caught up" with messages + Today routes', async () => {
    const { container } = await page();
    const empty = emptyOf(container, 'clear');
    expect(empty.dataset.tone).toBe('ok');
    expect(empty.dataset.variant).toBe('workQueueClear');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('All caught up');
    expect(empty.textContent).toMatch(/nothing else is flagged/);
    link(empty, 'Open messages', '/counselor/messages');
    link(empty, 'Back to Today', '/counselor');
    noLegacyEmpty(container);
  });

  it('nothing waiting but other members flagged: "No replies overdue", info tone, count and Inbox zero route', async () => {
    workQueue.context.mockResolvedValueOnce({ flaggedTotal: 3, awaitingReply: 0 });
    const { container } = await page();
    const empty = emptyOf(container, 'clear');
    expect(empty.dataset.tone).toBe('info');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No replies overdue');
    expect(empty.textContent).toMatch(/3 members are flagged for other reasons/);
    expect(empty.textContent).not.toMatch(/All caught up/);
    link(empty, 'Open Inbox zero', '/counselor/inbox');
  });

  it('when the shared attention context failed it never claims "All caught up"', async () => {
    workQueue.context.mockRejectedValueOnce(new Error('attention down'));
    const { container } = await page();
    const empty = emptyOf(container, 'clear');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('No replies overdue');
    expect(empty.textContent).toMatch(/Other flags are listed in Inbox zero/);
    link(empty, 'Open Inbox zero', '/counselor/inbox');
  });

  it('a failed queue read is unavailable/danger with role=alert, the error-state marker and a Retry link', async () => {
    workQueue.rows.mockRejectedValueOnce(new Error('queue down'));
    const { container } = await page();
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(empty).toHaveAttribute('data-portal-error-state', 'counselor-work-queue-load-failed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent('Could not load work queue');
    link(empty, 'Retry', '/counselor/queue');
    expect(container.querySelector('.wa-kit-empty[data-kind="clear"]')).toBeNull();
  });
});

describe('/counselor/placements page', () => {
  it('zero rows is first with the record action opening the form; never on a failed read', async () => {
    const fetchMock = vi.fn(async () => Response.json({ placements: [], memberOptions: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = portal('en', <PlacementsPage />);
    await waitFor(() => expect(container.querySelector('.wa-kit-empty')).not.toBeNull());
    const empty = emptyOf(container, 'first');
    expect(empty.dataset.tone).toBe('muted');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent('No placements yet');
    expect(empty.textContent).not.toMatch(/it will appear in this list/);
    expect(container.querySelector('form')).toBeNull();
    fireEvent.click(within(empty).getByRole('button', { name: 'Record placement' }));
    expect(container.querySelector('form')).not.toBeNull();
    noLegacyEmpty(container);
  });

  it('a failed list read is unavailable/danger, role=alert, and Try again refetches', async () => {
    const fetchMock = vi.fn(async () => new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = portal('en', <PlacementsPage />);
    await waitFor(() => expect(container.querySelector('.wa-kit-empty')).not.toBeNull());
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(within(empty).getByRole('heading')).toHaveTextContent("Couldn't load placements");
    expect(container.querySelector('.wa-kit-empty[data-kind="first"]')).toBeNull();
    expect(container.textContent).not.toMatch(/No placements yet/);
    fireEvent.click(within(empty).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('/counselor/inactive-members page', () => {
  it('zero inactive members at the threshold is clear/ok with the threshold interpolated and a roster route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ members: [] })));
    const { container } = portal('en', <InactiveMembersPage />);
    await waitFor(() => expect(container.querySelector('.wa-kit-empty')).not.toBeNull());
    const empty = emptyOf(container, 'clear');
    expect(empty.dataset.tone).toBe('ok');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent('Everyone is active');
    expect(within(empty).getByText('No member has gone 7+ days without activity.')).toBeInTheDocument();
    link(empty, 'My members', '/counselor/students');
    noLegacyEmpty(container);
  });

  it('a failed read is unavailable/danger with role=alert and Try again refetches', async () => {
    const fetchMock = vi.fn(async () => new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = portal('en', <InactiveMembersPage />);
    await waitFor(() => expect(container.querySelector('.wa-kit-empty')).not.toBeNull());
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(within(empty).getByRole('heading')).toHaveTextContent("Couldn't load inactive members");
    expect(container.textContent).not.toMatch(/Everyone is active/);
    fireEvent.click(within(empty).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('CounselorMessagesInboxClient', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: no assigned members is unavailable/info with the guide and Today routes', (locale) => {
    const { container } = portal(locale, <CounselorMessagesInboxClient staffUserId="staff-1" rows={[]} />);
    const m = LOCALES[locale].empty.counselor.inbox;
    const empties = container.querySelectorAll<HTMLElement>('[data-testid="counselor-inbox-empty"]');
    expect(empties.length).toBeGreaterThan(0);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('unavailable');
      expect(empty.dataset.tone).toBe('info');
      expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.title);
      link(empty, m.action, '/counselor/guide');
      link(empty, m.secondary, '/counselor');
    }
    expect(container.querySelector('[data-testid="counselor-inbox-filtered"]')).toBeNull();
    noLegacyEmpty(container);
  });
});
