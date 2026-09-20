process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Counselor audit §6 item 2: the roster's message icon deep-links to
 * `#counselor-member-messages`. That anchor used to sit at the foot of the
 * desktop body only. It now renders once, with the composer inside it, as the
 * whole of the Messages tab panel (§6 item 3 grouped the record into tabs), so
 * the link opens Messages and lands on the composer at every width — the tab
 * switch itself is covered by tests/app/counselor-student-detail-tabs.spec.tsx.
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
vi.mock('@/components/portal/PageHeader', () => ({ default: () => <header data-page-header /> }));
vi.mock('@/components/portal/counselor/MemberProgressTimeline', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorTrainingHandoff', () => ({ default: () => null }));
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

const INSTANT = new Date('2026-09-19T02:30:00Z');

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(
    await CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }),
  );
}

describe('CounselorStudentDetailPage message rail', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => ({ id: 'assign-1' });
    db.overrides['user.findFirst'] = async () => ({
      id: 'member-1',
      fullName: 'Fixture Member',
      email: null,
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

  it('renders the #counselor-member-messages anchor once, with the composer inside, as the Messages tab panel', async () => {
    const html = await renderPage();

    expect(html.match(/id="counselor-member-messages"/g)).toHaveLength(1);

    const anchorAt = html.indexOf('id="counselor-member-messages"');
    const headerAt = html.indexOf('data-page-header');
    const tablistAt = html.indexOf('role="tablist"');
    expect(headerAt).toBeGreaterThan(-1);
    expect(tablistAt).toBeGreaterThan(-1);
    // Header, then the tab row, then the thread inside its panel.
    expect(anchorAt).toBeGreaterThan(headerAt);
    expect(anchorAt).toBeGreaterThan(tablistAt);

    const doc = document.implementation.createHTMLDocument('rail');
    doc.body.innerHTML = html;
    const anchor = doc.getElementById('counselor-member-messages')!;
    const panel = anchor.closest('[role="tabpanel"]');
    expect(panel?.id).toBe('counselor-member-record-panel-messages');
    // The anchor is the panel's whole content — nothing to scroll past.
    expect(panel?.children).toHaveLength(1);
    expect(panel?.children[0]).toBe(anchor);
    const messagesTab = doc.getElementById('counselor-member-record-tab-messages');
    expect(messagesTab?.getAttribute('aria-controls')).toBe(panel?.id);
    expect(messagesTab?.getAttribute('role')).toBe('tab');

    const section = html.slice(anchorAt, html.indexOf('</section>', anchorAt));
    expect(section).toContain('data-composer="thread-1"');
    expect(section).toContain('aria-labelledby="counselor-member-messages-title"');
    expect(section).toContain('id="counselor-member-messages-title"');
    // The composer exists only once — the panel did not duplicate the thread.
    expect(html.match(/data-composer=/g)).toHaveLength(1);
  });

  it('still names the section and explains when no conversation exists yet', async () => {
    const { getOrCreateMemberCounselorThread } = await import('@/lib/messages/counselorThread');
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValueOnce(null as never);
    const html = await renderPage();

    const anchorAt = html.indexOf('id="counselor-member-messages"');
    const section = html.slice(anchorAt, html.indexOf('</section>', anchorAt));
    expect(section).toContain('No counselor conversation has started yet.');
    expect(html.match(/data-composer=/g)).toBeNull();
  });
});
