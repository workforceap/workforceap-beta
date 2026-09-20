process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Counselor audit §6 item 3 / §2 item 4: the student record reads as four
 * tabs (Profile / Training / Notes / Messages) instead of one long scroll.
 *
 * Server half: the page renders every panel (no second fetch), hides the
 * inactive ones, honours `?tab=`, keeps exactly one h1 and keeps the public
 * `#counselor-member-messages` anchor inside the Messages panel.
 *
 * Client half: the kit Tabs island opens the panel an in-page anchor lives in,
 * scrolls to it, mirrors the selection to `?tab=` without navigating, and
 * moves selection with the arrow keys.
 */

const db = vi.hoisted(() => {
  const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
  const defaultFor = (method: string) => async () =>
    method === 'count' ? 0 : method === 'findMany' || method === 'groupBy' ? [] : null;
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({}, {
        get: (_m, method: string) => (args: unknown) =>
          (overrides[`${model}.${method}`] ?? defaultFor(method))(args),
      }),
  });
  return { prisma, overrides };
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false), isCounselor: vi.fn(async () => true) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn(async () => true) }));
vi.mock('@/lib/messages/counselorThread', () => ({
  compactStringIds: (ids: Array<string | null>) => ids.filter((id): id is string => typeof id === 'string'),
  getMessageAuthorName: () => 'Staff',
  getOrCreateMemberCounselorThread: vi.fn(async () => ({
    id: 'thread-1',
    memberId: 'member-1',
    counselorUserId: 'staff-1',
    memberLastReadAt: null,
    counselorLastReadAt: null,
  })),
  serializeMessage: (m: unknown) => m,
}));
vi.mock('@/lib/member/points', () => ({ getMemberPoints: vi.fn(async () => null) }));
vi.mock('@/lib/billing/packetAccess', () => ({ listPacketsForMember: vi.fn(async () => []) }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn(async () => new Map()) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/counselor/MemberProgressTimeline', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorTrainingHandoff', () => ({ default: () => <h2>Funding and training access</h2> }));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({
  default: ({ initial }: { initial: { thread: { id: string } } }) => <form data-composer={initial.thread.id} />,
}));
vi.mock('@/components/admin/WioaScreeningReadonly', () => ({ default: () => null }));
vi.mock('@/components/admin/AssessmentAnswersReadonly', () => ({ default: () => null }));
vi.mock('@/components/billing/BillingPacketList', () => ({ default: () => null }));
vi.mock('@/components/counselor/StaffMemberResumePanel', () => ({ default: () => null }));
vi.mock('@/components/counselor/CounselorIntakeReviewPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/AwardPointsButton', () => ({ default: () => null }));
vi.mock('@/components/portal/PointsWidget', () => ({ default: () => null }));
vi.mock('@/components/portal/SkillsetProgressList', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/CounselorNotesPanel', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/AdvisorSessionNotesPanel', () => ({ default: () => null }));

import CounselorStudentDetailPage from '@/app/(portal)/counselor/students/[memberId]/page';
import {
  STUDENT_DETAIL_TABS,
  STUDENT_DETAIL_TABS_ID_BASE,
  parseStudentDetailTab,
} from '@/app/(portal)/counselor/students/[memberId]/studentDetailTabs';
import { TabPanel, Tabs } from '@/components/portal/kit';

const INSTANT = new Date('2026-09-19T02:30:00Z');
const BASE = STUDENT_DETAIL_TABS_ID_BASE;
const TAB_IDS = ['profile', 'training', 'notes', 'messages'] as const;

async function renderPage(searchParams?: Record<string, string | string[] | undefined>): Promise<Document> {
  const html = renderToStaticMarkup(
    await CounselorStudentDetailPage({
      params: Promise.resolve({ memberId: 'member-1' }),
      ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
    }),
  );
  const doc = document.implementation.createHTMLDocument('student detail');
  doc.body.innerHTML = html;
  return doc;
}

function panel(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(`${BASE}-panel-${id}`);
  if (!el) throw new Error(`missing panel ${id}`);
  return el;
}

function tab(doc: Document, id: string): HTMLElement {
  const el = doc.getElementById(`${BASE}-tab-${id}`);
  if (!el) throw new Error(`missing tab ${id}`);
  return el;
}

describe('CounselorStudentDetailPage record tabs (server render)', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => ({ id: 'assign-1' });
    db.overrides['user.findFirst'] = async () => ({
      id: 'member-1',
      fullName: 'Fixture Member',
      email: 'fixture@example.com',
      enrolledProgram: null,
      courseraEnrollmentApproved: false,
      programInterest: null,
      assessmentScorePct: null,
      assessmentScore: null,
      assessmentCompleted: false,
      assessmentCompletedAt: null,
      assessmentAnswers: null,
      wioaQualificationJson: null,
      wioaReviewStatus: null,
      wioaReviewedAt: null,
      wioaReviewedByUserId: null,
      wioaReviewNotes: null,
      careerRecommendationJson: null,
      createdAt: INSTANT,
      courseEnrollments: [],
      profile: null,
    });
  });

  it('renders the four tabs wired to four server-rendered panels, Profile open by default', async () => {
    const doc = await renderPage();

    const tablist = doc.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute('aria-label')).toBe('Member record');
    const tabs = Array.from(tablist!.querySelectorAll('[role="tab"]'));
    expect(tabs.map((el) => el.textContent)).toEqual(['Profile', 'Training', 'Notes', 'Messages']);

    for (const id of TAB_IDS) {
      const t = tab(doc, id);
      const p = panel(doc, id);
      expect(t.getAttribute('aria-controls')).toBe(p.id);
      expect(p.getAttribute('role')).toBe('tabpanel');
      expect(p.getAttribute('aria-labelledby')).toBe(t.id);
      // Every panel is in the HTML — no client fetch, no layout shift.
      expect(p.hasAttribute('hidden')).toBe(id !== 'profile');
      expect(t.getAttribute('aria-selected')).toBe(id === 'profile' ? 'true' : 'false');
      expect(t.getAttribute('tabindex')).toBe(id === 'profile' ? '0' : '-1');
    }
  });

  it('opens the tab named by ?tab= and falls back to Profile for unknown values', async () => {
    const training = await renderPage({ tab: 'training' });
    expect(panel(training, 'training').hasAttribute('hidden')).toBe(false);
    expect(panel(training, 'profile').hasAttribute('hidden')).toBe(true);
    expect(tab(training, 'training').getAttribute('aria-selected')).toBe('true');

    const messages = await renderPage({ tab: 'MESSAGES' });
    expect(panel(messages, 'messages').hasAttribute('hidden')).toBe(false);

    const bogus = await renderPage({ tab: 'nope' });
    expect(panel(bogus, 'profile').hasAttribute('hidden')).toBe(false);
    expect(panel(bogus, 'messages').hasAttribute('hidden')).toBe(true);

    expect(parseStudentDetailTab(['notes', 'profile'])).toBe('notes');
    expect(parseStudentDetailTab(undefined)).toBe('profile');
  });

  it('keeps exactly one h1 (the page header) and the section h2s inside the panels', async () => {
    const doc = await renderPage();
    const h1s = doc.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Fixture Member');

    const h2s = Array.from(doc.querySelectorAll('h2'));
    expect(h2s.length).toBeGreaterThanOrEqual(6);
    for (const h2 of h2s) {
      expect(h2.closest('[role="tabpanel"]'), `h2 "${h2.textContent}" sits outside every panel`).not.toBeNull();
    }
    // No tab panel starts with a bare heading above the tablist.
    expect(doc.querySelector('[role="tablist"]')!.compareDocumentPosition(h2s[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups the record sections under the expected tabs', async () => {
    const doc = await renderPage();
    const headingsIn = (id: string) => Array.from(panel(doc, id).querySelectorAll('h2')).map((h) => h.textContent);
    expect(headingsIn('profile')).toEqual(
      expect.arrayContaining(['Counselor 360 Signals', 'Resumes', 'Job Pipeline', 'Elevator Pitch Usage']),
    );
    expect(headingsIn('training')).toEqual(
      expect.arrayContaining(['Funding and training access', 'Program Progress', 'Training invoice & cover letter (J5 / J6)']),
    );
    expect(headingsIn('notes')).toEqual(['Counselor Notes', 'Session Notes']);
    expect(headingsIn('messages')).toEqual(['Messages']);
  });

  it('keeps the public #counselor-member-messages anchor, with the composer, inside the Messages panel', async () => {
    const doc = await renderPage();
    const anchors = doc.querySelectorAll('#counselor-member-messages');
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0] as HTMLElement;
    expect(anchor.closest('[role="tabpanel"]')?.id).toBe(`${BASE}-panel-messages`);
    expect(anchor.getAttribute('aria-labelledby')).toBe('counselor-member-messages-title');
    expect(anchor.querySelector('#counselor-member-messages-title')?.textContent).toBe('Messages');
    expect(anchor.querySelector('[data-composer="thread-1"]')).not.toBeNull();
    expect(doc.querySelectorAll('[data-composer]')).toHaveLength(1);
  });
});

// ─── Client island ──────────────────────────────────────────────────────────

function Island({ defaultValue = 'profile' }: { defaultValue?: string }) {
  return (
    <Tabs items={STUDENT_DETAIL_TABS} defaultValue={defaultValue} label="Member record" idBase={BASE} urlParam="tab">
      <TabPanel value="profile"><h2>Profile body</h2></TabPanel>
      <TabPanel value="training"><h2>Training body</h2></TabPanel>
      <TabPanel value="notes"><h2>Notes body</h2></TabPanel>
      <TabPanel value="messages">
        <section id="counselor-member-messages" aria-label="Messages"><form data-composer="thread-1" /></section>
      </TabPanel>
    </Tabs>
  );
}

describe('Student detail Tabs island (client)', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, '', '/counselor/students/member-1');
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true, writable: true });
  });
  afterEach(cleanup);

  it('opens Messages and scrolls to the composer when the roster deep-links to #counselor-member-messages', async () => {
    window.history.replaceState(null, '', '/counselor/students/member-1#counselor-member-messages');
    render(<Island />);

    const messagesTab = screen.getByRole('tab', { name: 'Messages' });
    await waitFor(() => expect(messagesTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'false');
    expect(document.getElementById(`${BASE}-panel-messages`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-profile`)).toHaveAttribute('hidden');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('counselor-member-messages'));
    // The hash stays: this was a deep link, not a user switch.
    expect(window.location.hash).toBe('#counselor-member-messages');
  });

  it('reacts to a later hashchange the same way', async () => {
    render(<Island />);
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');

    window.location.hash = '#counselor-member-messages';
    fireEvent(window, new Event('hashchange'));

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('switches on click and mirrors the choice to ?tab= with replaceState (no navigation)', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<Island />);

    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));

    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(`${BASE}-panel-notes`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-profile`)).toHaveAttribute('hidden');
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('notes');
    expect(window.location.pathname).toBe('/counselor/students/member-1');
    expect(replaceState).toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    pushState.mockRestore();
  });

  it('starts on the ?tab= value the server parsed', () => {
    render(<Island defaultValue={parseStudentDetailTab('training')} />);
    expect(screen.getByRole('tab', { name: 'Training' })).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(`${BASE}-panel-training`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-profile`)).toHaveAttribute('hidden');
  });

  it('moves selection with Arrow / Home / End keys and keeps one tab stop', async () => {
    render(<Island />);
    const tabs = TAB_IDS.map((id) => document.getElementById(`${BASE}-tab-${id}`) as HTMLButtonElement);
    tabs[0].focus();
    expect(tabs[0]).toHaveFocus();

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
    expect(tabs[1]).toHaveFocus();
    expect(document.getElementById(`${BASE}-panel-training`)).not.toHaveAttribute('hidden');
    expect(tabs.filter((t) => t.tabIndex === 0)).toEqual([tabs[1]]);

    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    await waitFor(() => expect(tabs[0]).toHaveAttribute('aria-selected', 'true'));
    expect(tabs[0]).toHaveFocus();

    // Wraps from the first tab back to the last.
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    await waitFor(() => expect(tabs[3]).toHaveAttribute('aria-selected', 'true'));
    expect(document.getElementById(`${BASE}-panel-messages`)).not.toHaveAttribute('hidden');

    fireEvent.keyDown(tabs[3], { key: 'Home' });
    await waitFor(() => expect(tabs[0]).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(tabs[0], { key: 'End' });
    await waitFor(() => expect(tabs[3]).toHaveAttribute('aria-selected', 'true'));
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('messages');
  });
});
