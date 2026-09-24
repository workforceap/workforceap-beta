import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard/messages',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return { channel: () => channel, removeChannel: async () => {} };
  },
}));
// Server pages: auth, DB and thread provisioning are stubbed; translations are the real en.json.
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'member-1' })) }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn(async () => ({ redirectTo: null })) }));
vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(async () => ({ employerId: 'employer-1' })),
  getPartnerForUser: vi.fn(async () => ({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } })),
}));
vi.mock('@/lib/auth/portalGuards', () => ({
  unlinkedEmployerHref: vi.fn(async () => '/employer/setup'),
  unlinkedPartnerHref: vi.fn(async () => '/partner/setup'),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    message: { findMany: vi.fn(), count: vi.fn() },
    messageThread: { findUnique: vi.fn() },
    partnerReferral: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/messages/counselorThread', () => ({ getOrCreateMemberCounselorThread: vi.fn(), serializeMessage: vi.fn((m: unknown) => m) }));
vi.mock('@/lib/messages/portalThreads', () => ({ getOrCreateEmployerMessageThread: vi.fn(), getOrCreatePartnerMessageThread: vi.fn() }));
vi.mock('@/lib/messages/employerInbox', () => ({ buildEmployerInbox: vi.fn() }));
vi.mock('@/lib/member/loadTrainingWorkspace', () => ({ loadTrainingWorkspace: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : `${ns}.${key}`;
  }),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/employer/EmployerPageOpener', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/EmployerMessagesInboxClient', async (importOriginal) => importOriginal());

import MemberCounselorChatClient from '@/components/portal/MemberCounselorChatClient';
import MemberMessagesMobileClient from '@/components/portal/MemberMessagesMobileClient';
import PortalTeamChatClient from '@/components/portal/PortalTeamChatClient';
import EmployerMessagesInboxClient from '@/components/portal/EmployerMessagesInboxClient';
import EmployerApplicationChatClient from '@/components/portal/EmployerApplicationChatClient';
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import EmployerMessagesPage from '@/app/(portal)/employer/messages/page';
import PartnerMessagesPage from '@/app/(portal)/partner/messages/page';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { prisma } from '@/lib/db/prisma';

/**
 * PR 3 of the empty-state consolidation (KIT_GUIDE §6): every empty state on
 * the messages surfaces renders through KitEmptyState with a `kind` and
 * `empty.*` copy in every locale. A thread with nothing sent is `first` and
 * its action puts the cursor in the composer; no counselor assigned yet is
 * `unavailable` (warn) and honest about who reads the thread; a thread that
 * failed to load is `unavailable`/danger with a real retry; the page-level
 * inbox guards (no member row, no thread in an audit) are `unavailable`, never
 * "No messages yet". Nothing here promises a reply time.
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;
const REPLY_PROMISE = /business day|within \d|\d+ ?h(ours)?\b/i;
const FIXTURES = join(__dirname, '../fixtures/empty-state-3');
type ThreadDto = { id: string; memberId: string | null; counselorUserId: string | null; memberLastReadAt: string | null; counselorLastReadAt: string | null };
const thread: ThreadDto = { id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: null, counselorLastReadAt: null };
const unassigned: ThreadDto = { ...thread, counselorUserId: null };

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.scrollTo = () => {};
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function emptyOf(root: ParentNode, kind: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.wa-kit-empty[data-kind="${kind}"]`);
  expect(el, `a KitEmptyState with data-kind="${kind}"`).not.toBeNull();
  return el as HTMLElement;
}
function noLegacyEmpty(root: ParentNode) {
  expect(root.querySelector('.portal-inbox__empty, .portal-empty-state')).toBeNull();
}
/** Rendered with exactly the messages the (portal) layout ships to the browser. */
function portal(locale: Locale, ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>{ui}</NextIntlClientProvider>);
}
function expectFirstThread(empty: HTMLElement, m: (typeof LOCALES)[Locale], group: 'counselorThread' | 'thread' | 'teamThreadEmployer' | 'applicationThread') {
  expect(empty.dataset.tone).toBe('muted');
  expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty[group].title);
  expect(within(empty).getByText(m.empty[group].body).className).toContain('wa-kit-lede');
  const action = within(empty).getByRole('button', { name: m.empty[group].action });
  expect(action.className).toContain('wa-kit-cta');
  expect(empty.textContent).not.toMatch(RAW_KEY);
  expect(empty.textContent).not.toMatch(REPLY_PROMISE);
  return action;
}

describe('member counselor chat (legacy desktop): thread with nothing sent yet', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: is a first state whose action focuses the composer', (locale) => {
    const m = LOCALES[locale];
    const { container } = portal(locale, <MemberCounselorChatClient initial={{ thread, counselorName: 'Dana Lee', messages: [], memberUserId: 'member-1' }} />);
    const empty = emptyOf(container, 'first');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(empty.querySelector('.wa-kit-empty-icon')).not.toBeNull();
    const action = expectFirstThread(empty, m, 'counselorThread');
    fireEvent.click(action);
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    expect(container.querySelector('[data-kind="unavailable"]')).toBeNull();
    noLegacyEmpty(container);
    expect(screen.queryByText('Say hello to your counselor — they reply within 2 business days.')).toBeNull();
  });

  it.each(Object.keys(LOCALES) as Locale[])('%s: no counselor assigned yet is unavailable (warn) and honest that writing still works', (locale) => {
    const m = LOCALES[locale];
    const { container } = portal(locale, <MemberCounselorChatClient initial={{ thread: unassigned, counselorName: null, messages: [], memberUserId: 'member-1' }} />);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(empty).not.toHaveAttribute('role', 'alert');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.counselorUnassigned.title);
    expect(within(empty).getByText(m.empty.counselorUnassigned.body)).toBeInTheDocument();
    fireEvent.click(within(empty).getByRole('button', { name: m.empty.counselorUnassigned.action }));
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    expect(container.querySelector('[data-kind="first"]')).toBeNull();
    expect(empty.textContent).not.toMatch(RAW_KEY);
    expect(empty.textContent).not.toMatch(REPLY_PROMISE);
  });

  it('keeps the structural change on record: before/after outerHTML of the thread log', async () => {
    const { container } = portal('en', <MemberCounselorChatClient initial={{ thread, counselorName: 'Dana Lee', messages: [], memberUserId: 'member-1' }} />);
    const log = container.querySelector('.member-counselor-chat__scroll') as HTMLElement;
    await expect(log.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/counselor-chat-desktop.after.html');
    const before = readFileSync(join(FIXTURES, 'counselor-chat-desktop.before.html'), 'utf8');
    expect(before).toContain('No messages yet');
    expect(before).toContain('they reply within 2 business days');
    // PortalEmptyState already delegated to the kit (#2490): the old box had the default kind and no action.
    expect(before).not.toContain('wa-kit-empty-actions');
    expect(log.outerHTML).toContain('data-kind="first"');
    expect(log.outerHTML).toContain('wa-kit-empty-actions');
    expect(log.outerHTML).not.toContain('2 business days');
  });
});

describe('member messages (legacy mobile): open thread with nothing sent yet', () => {
  function openThread(locale: Locale, t = thread, counselorName: string | null = 'Dana Lee') {
    const view = portal(locale, <MemberMessagesMobileClient initial={{ thread: t, counselorName, counselorInitials: 'DL', messages: [], memberUserId: 'member-1', lastMsgText: '', lastMsgTime: '', unreadCount: 0 }} />);
    fireEvent.click(view.getByRole('button', { name: counselorName ? new RegExp(counselorName) : /Your Counselor/ }));
    return view;
  }

  it.each(Object.keys(LOCALES) as Locale[])('%s: first state, action focuses the compose box', (locale) => {
    const m = LOCALES[locale];
    const { container } = openThread(locale);
    const empty = emptyOf(container, 'first');
    expect(empty.className).toContain('wa-kit-empty--framed');
    const action = expectFirstThread(empty, m, 'counselorThread');
    fireEvent.click(action);
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    expect(screen.queryByText('No messages yet. Say hello!')).toBeNull();
  });

  it('keeps the empty state in the first viewport: centred, and the thread does not auto-scroll when nothing is there to scroll to', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { container, unmount } = openThread('en');
    const empty = emptyOf(container, 'first');
    expect(empty.parentElement?.className).toContain('wa-justify-center');
    expect(empty.parentElement?.className).toContain('wa-h-full');
    expect(scroll).not.toHaveBeenCalled();
    unmount();
    // With a message the thread still scrolls to the latest bubble.
    const view = portal('en', <MemberMessagesMobileClient initial={{ thread, counselorName: 'Dana Lee', counselorInitials: 'DL', messages: [{ id: 'm-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Hi Sam', createdAt: '2026-09-01T12:00:00Z' }], memberUserId: 'member-1', lastMsgText: 'Hi Sam', lastMsgTime: '', unreadCount: 0 }} />);
    fireEvent.click(view.getByRole('button', { name: /Dana Lee/ }));
    expect(scroll).toHaveBeenCalled();
  });

  it('no counselor assigned yet is the warn unavailable state', () => {
    const { container } = openThread('en', unassigned, null);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.counselorUnassigned.title);
  });

  it('before/after outerHTML of the thread log', async () => {
    const { container } = openThread('en');
    const log = container.querySelector('[role="log"]') as HTMLElement;
    await expect(log.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/counselor-chat-mobile.after.html');
    const before = readFileSync(join(FIXTURES, 'counselor-chat-mobile.before.html'), 'utf8');
    expect(before).toContain('No messages yet. Say hello!');
    expect(before).not.toContain('data-kind=');
    expect(log.outerHTML).toContain('data-kind="first"');
  });
});

describe('member inbox kit: empty conversation list and empty thread', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: both are first states; the thread action focuses the composer', (locale) => {
    const m = LOCALES[locale];
    const { container } = portal(locale, <MemberMessagesKit conversations={[]} messages={[]} memberUserId="member-1" activeName="Dana Lee" />);
    const empties = Array.from(container.querySelectorAll<HTMLElement>('.wa-kit-empty'));
    expect(empties.map((e) => e.dataset.kind)).toEqual(['first', 'first']);
    const [list, threadEmpty] = empties;
    expect(within(list).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.conversations.title);
    expect(within(list).getByText(m.empty.conversations.body)).toBeInTheDocument();
    expect(list.querySelector('.wa-kit-empty-actions')).toBeNull();
    const action = expectFirstThread(threadEmpty, m, 'thread');
    fireEvent.click(action);
    expect(document.activeElement).toBe(container.querySelector('#wa-kit-chat-input'));
    expect(screen.queryByText('No messages yet. Type below to start this thread.')).toBeNull();
    expect(screen.queryByText('Your counselor thread opens here after you send a message.')).toBeNull();
  });

  it('a read-only thread (no sender) has no action', () => {
    const { container } = portal('en', <MemberMessagesKit conversations={[]} messages={[]} />);
    const [, threadEmpty] = Array.from(container.querySelectorAll<HTMLElement>('.wa-kit-empty'));
    expect(threadEmpty.dataset.kind).toBe('first');
    expect(threadEmpty.querySelector('.wa-kit-empty-actions')).toBeNull();
  });

  it('before/after outerHTML of the inbox card', async () => {
    const { container } = portal('en', <MemberMessagesKit conversations={[]} messages={[]} memberUserId="member-1" />);
    const card = container.querySelector('.wa-kit-card') as HTMLElement;
    await expect(card.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/messages-kit.after.html');
    const before = readFileSync(join(FIXTURES, 'messages-kit.before.html'), 'utf8');
    expect(before).toContain('No messages yet. Type below to start this thread.');
    expect(before).toContain('Your counselor thread opens here after you send a message.');
    expect(before).not.toContain('wa-kit-empty-actions');
    expect(card.outerHTML).toContain('wa-kit-empty-actions');
  });
});

describe('employer / partner team thread (PortalTeamChatClient)', () => {
  const teamEmpty = { title: en.empty.teamThreadEmployer.title, description: en.empty.teamThreadEmployer.body, action: en.empty.teamThreadEmployer.action };
  function show() {
    return render(<PortalTeamChatClient surfaceVariant="employer" decorated={false} apiPath="/api/employer/messages" initial={{ thread: { id: 'team-1', portalUserLastReadAt: null }, messages: [], portalUserId: 'employer-user' }} subtitle="Our team reads every message and replies here." empty={teamEmpty} />);
  }

  it('renders the caller copy as a first state whose action focuses the composer', () => {
    const { container } = show();
    const empty = emptyOf(container, 'first');
    const action = expectFirstThread(empty, en, 'teamThreadEmployer');
    fireEvent.click(action);
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    // #2492's sentence survives, split into title + body.
    expect(container.textContent).toContain('No messages yet');
    expect(container.textContent).toContain('Ask a question about job postings, applications, or candidate matches.');
  });

  it('before/after outerHTML of the thread log', async () => {
    const { container } = show();
    const log = container.querySelector('.member-counselor-chat__scroll') as HTMLElement;
    await expect(log.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/team-chat.after.html');
    const before = readFileSync(join(FIXTURES, 'team-chat.before.html'), 'utf8');
    expect(before).toMatch(/<p[^>]*>No messages yet\. Ask a question about job postings, applications, or candidate matches\.<\/p>/);
    expect(before).not.toContain('data-kind=');
    expect(log.outerHTML).toContain('data-kind="first"');
  });
});

describe('employer inbox (EmployerMessagesInboxClient)', () => {
  const teamRow = { kind: 'team' as const, threadId: 'team-1', title: 'WorkforceAP team', preview: 'Welcome', sortAt: '2026-09-01T00:00:00Z', unreadCount: 0 };
  const candidate = { kind: 'candidate' as const, applicationId: 'app-1', studentName: 'Sam Rivera', jobTitle: 'Help Desk Technician', preview: 'Hi', sortAt: '2026-09-02T00:00:00Z', unreadCount: 0 };
  function show(candidateRows = [candidate]) {
    return portal('en', <EmployerMessagesInboxClient portalUserId="employer-user" teamRow={teamRow} candidateRows={candidateRows} teamInitial={{ thread: { id: 'team-1', portalUserLastReadAt: null }, messages: [] }} />);
  }

  it('a search that matches nothing is a filtered state whose Clear search restores the list', () => {
    const { container } = show();
    const [search] = screen.getAllByPlaceholderText('Search conversations…');
    fireEvent.change(search, { target: { value: 'zzz' } });
    const empty = emptyOf(container, 'filtered');
    expect(empty.dataset.tone).toBe('muted');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.conversationsFiltered.title);
    expect(within(empty).getByText(en.empty.conversationsFiltered.body)).toBeInTheDocument();
    expect(screen.queryByText('No conversations found')).toBeNull();
    noLegacyEmpty(container);
    fireEvent.click(within(empty).getByRole('button', { name: en.empty.conversationsFiltered.action }));
    expect(container.querySelector('[data-kind="filtered"]')).toBeNull();
    expect(screen.getAllByText('Sam Rivera').length).toBeGreaterThan(0);
  });

  it('before/after outerHTML of the filtered list', async () => {
    const { container } = show([]);
    fireEvent.change(screen.getAllByPlaceholderText('Search conversations…')[0], { target: { value: 'zzz' } });
    const wrapper = emptyOf(container, 'filtered').parentElement as HTMLElement;
    await expect(wrapper.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/employer-inbox-filtered.after.html');
    const before = readFileSync(join(FIXTURES, 'employer-inbox-filtered.before.html'), 'utf8');
    expect(before).toContain('portal-inbox__empty');
    expect(before).toContain('No conversations found');
    // The old InboxEmpty rendered the default kind ("first") for a search miss.
    expect(before).toContain('data-kind="first"');
    expect(before).not.toContain('data-kind="filtered"');
    expect(wrapper.outerHTML).toContain('data-kind="filtered"');
    expect(wrapper.outerHTML).not.toContain('portal-inbox__empty');
  });

  it('a candidate thread that fails to load is an unavailable/danger alert whose Try again refetches (was "Loading…" forever)', async () => {
    let loads = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/employer/applications/app-1/messages' && (init?.method ?? 'GET') === 'GET') {
        loads += 1;
        if (loads === 1) return new Response(JSON.stringify({ error: 'nope' }), { status: 500, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({
          application: { studentName: 'Sam Rivera', jobTitle: 'Help Desk Technician' },
          messages: [{ id: 'm-1', body: 'Thanks for reaching out.', createdAt: '2026-09-02T00:00:00Z', authorName: 'Sam Rivera', isFromEmployer: false }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const { container } = show();
    fireEvent.click(screen.getAllByRole('button', { name: /Sam Rivera/ })[0]);
    const alert = (await screen.findAllByRole('alert'))[0];
    expect(alert).toBe(emptyOf(container, 'unavailable'));
    expect(alert.dataset.tone).toBe('danger');
    expect(within(alert).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.applicationThreadUnavailable.title);
    expect(within(alert).getByText(en.empty.applicationThreadUnavailable.body)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(container.querySelector('[data-kind="first"]')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: en.empty.applicationThreadUnavailable.action }));
    await waitFor(() => expect(loads).toBe(2));
    await screen.findAllByText('Thanks for reaching out.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('employer candidate thread (EmployerApplicationChatClient)', () => {
  it('nothing sent yet is a first state whose action focuses the composer', () => {
    const { container } = portal('en', <EmployerApplicationChatClient applicationId="app-1" studentName="Sam Rivera" jobTitle="Help Desk Technician" initialMessages={[]} />);
    const empty = emptyOf(container, 'first');
    const action = expectFirstThread(empty, en, 'applicationThread');
    fireEvent.click(action);
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    expect(screen.queryByText('No messages yet. Start the conversation about this application.')).toBeNull();
  });
});

describe('page-level inbox guards are unavailable states, not "No messages yet"', () => {
  it('member: no member row yet → provisioning (warn) with support as the route', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const { container } = render(await MemberMessagesPage({ searchParams: Promise.resolve({}) }));
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(empty.closest('.wa-kit-card')).not.toBeNull();
    expect(empty.className).not.toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(en.empty.inboxProvisioning.title);
    expect(within(empty).getByText(en.empty.inboxProvisioning.body)).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: en.empty.inboxProvisioning.action })).toHaveAttribute('href', 'mailto:info@workforceap.org');
    const back = within(empty).getByRole('link', { name: en.empty.inboxProvisioning.secondary });
    expect(back).toHaveAttribute('href', '/dashboard');
    expect(back.className).toContain('wa-kit-cta--ghost');
    // Same shell as the live inbox.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Messages');
    expect(container.textContent).not.toMatch(REPLY_PROMISE);
    expect(container.textContent).not.toMatch(RAW_KEY);
    expect(screen.queryByText('Inbox is being set up')).toBeNull();
    expect(screen.queryByText('No messages yet')).toBeNull();
    await expect(container.innerHTML).toMatchFileSnapshot('../fixtures/empty-state-3/messages-page-provisioning.after.html');
    const before = readFileSync(join(FIXTURES, 'messages-page-provisioning.before.html'), 'utf8');
    expect(before).toContain('No messages yet');
    // The old guard read as a confirmed-empty first state with a deprecated `action` slot.
    expect(before).toContain('data-kind="first"');
    expect(before).not.toContain('data-kind="unavailable"');
    expect(container.innerHTML).toContain('data-kind="unavailable"');
  });

  it('member: no thread in a read-only audit → inbox not ready (warn), back to the dashboard', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(isReadOnlyPortalAuditHeader).mockReturnValue(true);
    vi.mocked(prisma.messageThread.findUnique).mockResolvedValue(null as never);
    const { container } = render(await MemberMessagesPage({ searchParams: Promise.resolve({}) }));
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(en.empty.inboxUnavailable.title);
    expect(within(empty).getByRole('link', { name: en.empty.inboxUnavailable.action })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('Your counselor conversation will appear here after the first message.')).toBeNull();
  });

  it('employer: no thread in a read-only audit → inbox not ready (warn), back to the overview', async () => {
    vi.mocked(isReadOnlyPortalAuditHeader).mockReturnValue(true);
    vi.mocked(prisma.messageThread.findUnique).mockResolvedValue(null as never);
    const { container } = render(await EmployerMessagesPage());
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(en.empty.inboxUnavailable.title);
    expect(within(empty).getByRole('link', { name: en.empty.inboxUnavailable.overviewAction })).toHaveAttribute('href', '/employer');
    expect(screen.queryByText('Your WorkforceAP team conversation will appear here after the first message.')).toBeNull();
    expect(container.querySelector('.portal-card')).toBeNull();
  });

  it('partner: no thread in a read-only audit → inbox not ready (warn), back to the overview', async () => {
    vi.mocked(isReadOnlyPortalAuditHeader).mockReturnValue(true);
    vi.mocked(prisma.messageThread.findUnique).mockResolvedValue(null as never);
    const { container } = render(await PartnerMessagesPage({ searchParams: Promise.resolve({}) }));
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('warn');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(en.empty.inboxUnavailable.title);
    expect(within(empty).getByRole('link', { name: en.empty.inboxUnavailable.overviewAction })).toHaveAttribute('href', '/partner');
    expect(container.querySelector('[data-kind="first"]')).toBeNull();
  });
});
