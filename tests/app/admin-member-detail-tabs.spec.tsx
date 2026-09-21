process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin audit gap map (wave 16): the admin member record reads as seven tabs
 * (Overview / Program / Eligibility / Placement / Messages / Notes / Activity)
 * instead of one long scroll.
 *
 * Server half: the page renders every panel (no second fetch), hides the
 * inactive ones, honours `?tab=`, keeps exactly one h1, keeps every existing
 * sub-panel exactly once (nothing dropped, nothing duplicated) and keeps the
 * `#placed-outcome` anchor inside the Placement panel.
 *
 * Client half: the kit Tabs island opens Placement when a `#placed-outcome`
 * deep link lands, and mirrors a switch to `?tab=` without navigating.
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

const panelMock = vi.hoisted(() => (name: string) => ({ default: () => <div data-panel={name} /> }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async () => ({}) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, superAdmin: true, orgId: 'org-1' })),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (dbArg: unknown) => Promise<unknown>) => fn(db.prisma)),
  inheritUserOrg: () => ({}),
  inheritMemberOrg: () => ({}),
  inheritLeaderOrg: () => ({}),
  inheritInvitedByOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/workspace-email/provider', () => ({
  getWorkspaceEmailAvailability: () => ({ available: false, reason: 'Provider not configured' }),
}));
vi.mock('@/lib/platform/trainingEnrollmentGate', () => ({ isMemberWioaVerified: () => ({ ok: false, reason: 'not_reviewed' }) }));
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
vi.mock('@/lib/admin/applicantTriageLoad', () => ({ loadApplicantTriageByUserIds: vi.fn(async () => new Map()) }));
vi.mock('@/lib/wioa/reviewSnapshot', () => ({ loadWioaReviewSnapshots: vi.fn(async () => []) }));
vi.mock('@/lib/coursera/progressQueries', () => ({ loadLearnerProgressByUserId: vi.fn(async () => null) }));
vi.mock('@/lib/admin/boardOutcomes', () => ({ SMALL_SAMPLE_THRESHOLD: 10 }));
vi.mock('@/lib/admin/memberOutcomesSummary', () => ({
  getMemberOutcomesSummary: vi.fn(async () => ({
    placedLast90d: 3,
    placementRate: 40,
    membersEnrolled: 20,
    membersPlaced: 8,
    averageWeeksToPlacement: 6,
  })),
}));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: vi.fn(async () => null) }));
vi.mock('@/components/portal/MemberProgressStrip', () => panelMock('progress-strip'));
vi.mock('@/app/admin/members/[id]/CreateSuccessToast', () => ({ default: () => null }));
vi.mock('@/app/admin/members/[id]/AdminMemberAiMatches', () => panelMock('ai-matches'));
vi.mock('@/components/admin/AdminMemberResumeSection', () => panelMock('resumes'));
vi.mock('@/components/admin/AssessmentAnswersReadonly', () => panelMock('assessment'));
vi.mock('@/components/admin/MemberDetailActions', () => ({
  default: ({ userId, programOptions, currentProgramSlug }: { userId: string; programOptions: unknown[]; currentProgramSlug: string | null }) => (
    <form data-panel="program-change" data-user-id={userId} data-options={programOptions.length} data-current={currentProgramSlug ?? ''} />
  ),
}));
vi.mock('@/components/admin/MemberCourseraEnrollmentApproval', () => panelMock('coursera-approval'));
vi.mock('@/components/admin/AdminMemberConsentPanel', () => panelMock('consent'));
vi.mock('@/components/admin/AdminMemberDbActions', () => panelMock('db-actions'));
vi.mock('@/components/admin/AdminMemberQuickSummary', () => panelMock('quick-summary'));
vi.mock('@/components/admin/AdminMemberSendLinks', () => panelMock('send-links'));
vi.mock('@/components/admin/MemberPartnerSection', () => panelMock('partner'));
vi.mock('@/components/admin/MemberSubgroupSection', () => panelMock('subgroup'));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({
  default: ({ initial }: { initial: { thread: { id: string } } }) => <form data-panel="chat" data-composer={initial.thread.id} />,
}));
vi.mock('@/components/admin/AdminMemberCounselorAssign', () => panelMock('counselor-assign'));
vi.mock('@/components/admin/AdminMemberPlacedOutcomeForm', () => panelMock('placed-outcome-form'));
vi.mock('@/components/admin/AdminMemberEnrollmentFundingForm', () => panelMock('enrollment-funding'));
vi.mock('@/components/admin/AdminMemberWorkspaceEmail', () => panelMock('workspace-email'));
vi.mock('@/components/admin/AdminMemberWioaReviewPanel', () => panelMock('wioa-review'));
vi.mock('@/components/admin/ApplicantTriageChecklist', () => panelMock('triage'));
vi.mock('@/components/admin/MemberCourseraDiagnoseButton', () => panelMock('coursera-diagnose'));
vi.mock('@/components/admin/AdminMemberSkillCheckpointPanel', () => panelMock('skill-checkpoints'));
vi.mock('@/app/admin/members/[id]/AdminMemberNotesPanel', () => panelMock('notes'));

import AdminMemberDetailPage from '@/app/admin/members/[id]/page';
import {
  ADMIN_MEMBER_DETAIL_TABS,
  ADMIN_MEMBER_DETAIL_TABS_ID_BASE,
  parseAdminMemberDetailTab,
} from '@/app/admin/members/[id]/memberDetailTabs';
import { TabPanel, Tabs } from '@/components/portal/kit';

const INSTANT = new Date('2026-09-19T02:30:00Z');
const BASE = ADMIN_MEMBER_DETAIL_TABS_ID_BASE;
const TAB_IDS = ['overview', 'program', 'eligibility', 'placement', 'messages', 'notes', 'activity'] as const;

/** Every sub-panel the long page had, keyed by the tab that now owns it. */
const PANELS_BY_TAB: Record<(typeof TAB_IDS)[number], string[]> = {
  overview: ['db-actions', 'quick-summary', 'send-links', 'counselor-assign', 'partner', 'subgroup', 'workspace-email'],
  program: ['program-change', 'coursera-diagnose', 'skill-checkpoints', 'enrollment-funding'],
  eligibility: ['consent', 'coursera-approval'],
  placement: ['placed-outcome-form', 'ai-matches', 'resumes'],
  messages: ['chat'],
  notes: ['notes'],
  activity: [],
};

async function renderPage(searchParams?: Record<string, string | string[] | undefined>): Promise<Document> {
  const html = renderToStaticMarkup(
    await AdminMemberDetailPage({
      params: Promise.resolve({ id: 'member-1' }),
      ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
    }),
  );
  const doc = document.implementation.createHTMLDocument('member detail');
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

describe('AdminMemberDetailPage record tabs (server render)', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['user.findFirst'] = async () => ({
      id: 'member-1',
      organizationId: 'org-1',
      email: 'fixture@example.com',
      fullName: 'Fixture Member',
      phone: '5125550100',
      deletedAt: null,
      enrolledProgram: null,
      enrolledAt: null,
      programChangedAt: null,
      assessmentCompleted: false,
      assessmentCompletedAt: null,
      assessmentScore: null,
      assessmentScorePct: null,
      programInterest: null,
      assessmentAnswers: null,
      interviewEligible: false,
      interviewRequestedAt: null,
      interviewCompletedAt: null,
      workspaceEmail: null,
      workspaceEmailProvisioned: false,
      careerRecommendationJson: null,
      applications: [{ status: 'PENDING', submittedAt: INSTANT, recommendedCareerTitle: 'Data Analyst', programRankedSlugs: [] }],
      memberEvents: [],
      wioaQualificationJson: null,
      wioaReviewStatus: null,
      wioaReviewedAt: null,
      wioaReviewedByUserId: null,
      wioaReviewNotes: null,
      courseraEnrollmentApproved: false,
      courseraEnrollmentApprovedAt: null,
      courseraEnrollmentApprovedById: null,
      profile: null,
      learningProgress: [],
      courseProgress: [],
      memberProgramProgress: [],
      userCertifications: [],
      aiJobMatches: [],
    });
    db.overrides['auditLog.findMany'] = async () => [
      { id: 'a1', action: 'admin_program_change', createdAt: INSTANT, actorEmailSnapshot: null, actorRoleSnapshot: null, actor: { fullName: 'Staff Person' } },
    ];
    db.overrides['memberEvent.findMany'] = async (args: unknown) => {
      const where = (args as { where?: { userId?: string; eventName?: unknown } }).where ?? {};
      // The page's other memberEvent read (pending placement) filters by eventName.
      if (where.eventName) return [];
      return [{ id: 'e1', eventName: 'career_plan_saved', createdAt: new Date('2026-09-18T10:00:00Z') }];
    };
  });

  it('renders the seven tabs wired to seven server-rendered panels, Overview open by default', async () => {
    const doc = await renderPage();

    const tablist = doc.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute('aria-label')).toBe('Member record');
    const tabs = Array.from(tablist!.querySelectorAll('[role="tab"]'));
    expect(tabs.map((el) => el.textContent)).toEqual(['Overview', 'Program', 'Eligibility', 'Placement', 'Messages', 'Notes', 'Activity']);
    expect(ADMIN_MEMBER_DETAIL_TABS.map((t) => t.id)).toEqual([...TAB_IDS]);

    for (const id of TAB_IDS) {
      const t = tab(doc, id);
      const p = panel(doc, id);
      expect(t.getAttribute('aria-controls')).toBe(p.id);
      expect(p.getAttribute('role')).toBe('tabpanel');
      expect(p.getAttribute('aria-labelledby')).toBe(t.id);
      // Every panel is in the HTML — no client fetch, no layout shift.
      expect(p.hasAttribute('hidden')).toBe(id !== 'overview');
      expect(t.getAttribute('aria-selected')).toBe(id === 'overview' ? 'true' : 'false');
      expect(t.getAttribute('tabindex')).toBe(id === 'overview' ? '0' : '-1');
    }
  });

  it('opens the tab named by ?tab= and falls back to Overview for unknown values', async () => {
    const program = await renderPage({ tab: 'program' });
    expect(panel(program, 'program').hasAttribute('hidden')).toBe(false);
    expect(panel(program, 'overview').hasAttribute('hidden')).toBe(true);
    expect(tab(program, 'program').getAttribute('aria-selected')).toBe('true');

    const activity = await renderPage({ tab: 'ACTIVITY' });
    expect(panel(activity, 'activity').hasAttribute('hidden')).toBe(false);

    const bogus = await renderPage({ tab: 'nope' });
    expect(panel(bogus, 'overview').hasAttribute('hidden')).toBe(false);
    expect(panel(bogus, 'program').hasAttribute('hidden')).toBe(true);

    expect(parseAdminMemberDetailTab(['eligibility', 'overview'])).toBe('eligibility');
    expect(parseAdminMemberDetailTab(undefined)).toBe('overview');
    expect(parseAdminMemberDetailTab(' Messages ')).toBe('messages');
  });

  it('keeps exactly one h1 (the page header) and every section h2 inside a panel', async () => {
    const doc = await renderPage();
    const h1s = doc.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Fixture Member');

    const h2s = Array.from(doc.querySelectorAll('h2'));
    expect(h2s.length).toBeGreaterThanOrEqual(14);
    for (const h2 of h2s) {
      expect(h2.closest('[role="tabpanel"]'), `h2 "${h2.textContent}" sits outside every panel`).not.toBeNull();
    }
  });

  it('groups the record sections under the expected tabs', async () => {
    const doc = await renderPage();
    const headingsIn = (id: string) => Array.from(panel(doc, id).querySelectorAll('h2')).map((h) => h.textContent);
    expect(headingsIn('overview')).toEqual(['Admin Actions', 'Profile', 'Counselor assignment', 'Career-plan signal', 'Workspace email']);
    expect(headingsIn('program')).toEqual(['Program', 'Coursera training', 'Enrollment funding & workspace']);
    expect(headingsIn('eligibility')).toEqual(['Application status']);
    expect(headingsIn('placement')).toEqual(['Outcomes summary', 'Placement record', 'Resumes']);
    expect(headingsIn('messages')).toEqual(['Counselor conversation']);
    expect(headingsIn('notes')).toEqual(['Notes']);
    expect(headingsIn('activity')).toEqual(['Recent activity']);
  });

  it('preserves every existing sub-panel exactly once, under its tab', async () => {
    const doc = await renderPage();
    for (const id of TAB_IDS) {
      for (const name of PANELS_BY_TAB[id]) {
        const nodes = doc.querySelectorAll(`[data-panel="${name}"]`);
        expect(nodes, `panel ${name}`).toHaveLength(1);
        expect(nodes[0].closest('[role="tabpanel"]')?.id, `panel ${name} tab`).toBe(`${BASE}-panel-${id}`);
      }
    }
    // The journey strip stays above the tabs, not inside one.
    const strip = doc.querySelector('[data-panel="progress-strip"]');
    expect(strip).not.toBeNull();
    expect(strip!.closest('[role="tabpanel"]')).toBeNull();
    // Conditional panels stay conditional (no WIOA snapshot / triage / assessment on this fixture).
    for (const name of ['wioa-review', 'triage', 'assessment']) {
      expect(doc.querySelector(`[data-panel="${name}"]`), name).toBeNull();
    }
  });

  it('keeps both progress feeds, each labelled with its source, inside Program', async () => {
    const doc = await renderPage();
    const sources = Array.from(panel(doc, 'program').querySelectorAll('[data-progress-source]'));
    expect(sources.map((el) => el.getAttribute('data-progress-source'))).toEqual(['course-progress', 'coursera-learner-detail']);
    expect(sources[0].textContent).toMatch(/^Source: WorkforceAP course-progress rows/);
    expect(sources[1].textContent).toMatch(/^Source: Coursera B4B enrollment report/);
    expect(sources[0].closest('section')?.querySelector('h2')?.textContent).toBe('Program');
    expect(sources[1].closest('section')?.querySelector('h2')?.textContent).toBe('Coursera training');
  });

  it('keeps the program-change control pointed at the same member and options, inside Program', async () => {
    const doc = await renderPage();
    const form = doc.querySelector('[data-panel="program-change"]') as HTMLElement;
    expect(form.getAttribute('data-user-id')).toBe('member-1');
    expect(form.getAttribute('data-options')).toBe('0');
    expect(form.getAttribute('data-current')).toBe('');
    expect(form.closest('[role="tabpanel"]')?.id).toBe(`${BASE}-panel-program`);
  });

  it('keeps the #placed-outcome anchor (with the placement form) inside the Placement panel', async () => {
    const doc = await renderPage();
    const anchors = doc.querySelectorAll('#placed-outcome');
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0] as HTMLElement;
    expect(anchor.closest('[role="tabpanel"]')?.id).toBe(`${BASE}-panel-placement`);
    expect(anchor.querySelector('h2')?.textContent).toBe('Placement record');
    expect(anchor.querySelector('[data-panel="placed-outcome-form"]')).not.toBeNull();
  });

  it('puts the counselor thread composer in Messages and the merged trail in Activity', async () => {
    const doc = await renderPage();
    const composer = doc.querySelector('[data-composer="thread-1"]');
    expect(composer).not.toBeNull();
    expect(composer!.closest('[role="tabpanel"]')?.id).toBe(`${BASE}-panel-messages`);

    const activity = panel(doc, 'activity');
    const rows = Array.from(activity.querySelectorAll('li'));
    expect(rows.map((li) => li.querySelector('p')?.textContent)).toEqual(['Program change', 'Career plan saved']);
    expect(rows[0].textContent).toContain('Staff · Staff Person');
    expect(rows[1].textContent).toContain('Member');
    // The lifecycle route is a redirect alias of this tab, so the panel never links back to it.
    expect(activity.querySelector('a[href="/admin/members/member-1/lifecycle"]')).toBeNull();
    expect(activity.querySelector('a[href="/admin/audit-logs"]')).not.toBeNull();
  });

  it('shows the identity card status chips from loaded data', async () => {
    const doc = await renderPage();
    const chips = Array.from(panel(doc, 'overview').querySelectorAll('.wa-kit-tag')).map((el) => el.textContent);
    expect(chips).toEqual(
      expect.arrayContaining(['No program enrolled', 'WIOA · not reviewed', 'Application · pending', 'No counselor assigned', 'Super admin']),
    );
  });
});

// ─── Client island ──────────────────────────────────────────────────────────

function Island({ defaultValue = 'overview' }: { defaultValue?: string }) {
  return (
    <Tabs items={ADMIN_MEMBER_DETAIL_TABS} defaultValue={defaultValue} label="Member record" idBase={BASE} urlParam="tab">
      <TabPanel value="overview"><h2>Overview body</h2></TabPanel>
      <TabPanel value="program"><h2>Program body</h2></TabPanel>
      <TabPanel value="eligibility"><h2>Eligibility body</h2></TabPanel>
      <TabPanel value="placement">
        <section id="placed-outcome" aria-label="Placement record"><form data-panel="placed-outcome-form" /></section>
      </TabPanel>
      <TabPanel value="messages"><h2>Messages body</h2></TabPanel>
      <TabPanel value="notes"><h2>Notes body</h2></TabPanel>
      <TabPanel value="activity"><h2>Activity body</h2></TabPanel>
    </Tabs>
  );
}

describe('Admin member detail Tabs island (client)', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, '', '/admin/members/member-1');
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true, writable: true });
  });
  afterEach(cleanup);

  it('opens Placement and scrolls to the placement record when a #placed-outcome deep link lands', async () => {
    window.history.replaceState(null, '', '/admin/members/member-1#placed-outcome');
    render(<Island />);

    const placementTab = screen.getByRole('tab', { name: 'Placement' });
    await waitFor(() => expect(placementTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
    expect(document.getElementById(`${BASE}-panel-placement`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-overview`)).toHaveAttribute('hidden');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('placed-outcome'));
    expect(window.location.hash).toBe('#placed-outcome');
  });

  it('switches on click and mirrors the choice to ?tab= with replaceState (no navigation)', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<Island />);

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(`${BASE}-panel-activity`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-overview`)).toHaveAttribute('hidden');
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('activity');
    expect(window.location.pathname).toBe('/admin/members/member-1');
    expect(replaceState).toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    pushState.mockRestore();
  });

  it('starts on the ?tab= value the server parsed', () => {
    render(<Island defaultValue={parseAdminMemberDetailTab('eligibility')} />);
    expect(screen.getByRole('tab', { name: 'Eligibility' })).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(`${BASE}-panel-eligibility`)).not.toHaveAttribute('hidden');
    expect(document.getElementById(`${BASE}-panel-overview`)).toHaveAttribute('hidden');
  });
});
