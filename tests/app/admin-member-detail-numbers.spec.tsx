process.env.TZ = 'UTC';

/**
 * Number correctness on the admin member record (audit S8, S12).
 *
 * S8 — a member with real course progress but no enrollment pointer (no
 * CourseEnrollment row and User.enrolledProgram null) used to read
 * "No program enrolled" / "Course progress: No program enrolled" beside
 * genuine completions. The page must surface that evidence, and must not
 * invent an assignment from an arbitrary rollup.
 *
 * S12 — the Program tab's "Enrolled date" read User.enrolledAt, which is null
 * for members enrolled through CourseEnrollment only, printing "—" next to a
 * real program name taken from that same enrollment row.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { summarizeUnassignedTrainingEvidence } from '@/app/admin/members/[id]/unassignedTrainingEvidence';

const INSTANT = new Date('2026-09-19T02:30:00Z');

const baseMember = {
  id: 'member-1',
  organizationId: 'org-1',
  email: 'fixture@example.com',
  fullName: 'Fixture Member',
  phone: null,
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
  applications: [],
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
  courseProgress: [] as unknown[],
  memberProgramProgress: [] as unknown[],
  userCertifications: [],
  aiJobMatches: [],
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

describe('summarizeUnassignedTrainingEvidence (S8)', () => {
  const rollup = (programSlug: string, averagePercent: number, coursesCompleted: number, lastUpdatedAt = INSTANT) =>
    ({ programSlug, averagePercent, coursesCompleted, lastUpdatedAt });
  const course = (
    programSlug: string,
    courseSlug: string,
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED',
    percentComplete: number,
    lastUpdatedAt = INSTANT,
  ) => ({ programSlug, courseSlug, courseId: null, status, percentComplete, lastUpdatedAt });

  it('returns null when nothing shows activity', () => {
    expect(summarizeUnassignedTrainingEvidence([], [])).toBeNull();
    expect(
      summarizeUnassignedTrainingEvidence(
        [rollup('comptia-a-plus', 0, 0)],
        [course('comptia-a-plus', 'c1', 'NOT_STARTED', 0)],
      ),
    ).toBeNull();
  });

  it('does not pick an arbitrary rollup: the 0% legacy row loses to the program with completions', () => {
    // The relation has no orderBy, so `memberProgramProgress[0]` is whatever
    // the driver returns first — for 7 of the 10 affected members that is a
    // nightly-rewritten 0% comptia rollup.
    const evidence = summarizeUnassignedTrainingEvidence(
      [rollup('comptia-a-plus', 0, 0), rollup('it-support', 67, 2)],
      [],
    );
    expect(evidence?.programSlug).toBe('it-support');
    expect(evidence?.coursesCompleted).toBe(2);
    expect(evidence?.averagePercent).toBe(67);
  });

  it('builds evidence from course_progress rows when no rollup shows activity', () => {
    const evidence = summarizeUnassignedTrainingEvidence(
      [rollup('comptia-a-plus', 0, 0)],
      [
        course('it-support', 'c1', 'COMPLETED', 100),
        course('it-support', 'c2', 'COMPLETED', 100),
        course('it-support', 'c3', 'IN_PROGRESS', 10),
      ],
    );
    expect(evidence?.programSlug).toBe('it-support');
    expect(evidence?.coursesCompleted).toBe(2);
    expect(evidence?.coursesWithProgress).toBe(3);
    expect(evidence?.averagePercent).toBe(70);
  });

  it('ignores untouched rows and never counts a Learning Path row as a course', () => {
    const evidence = summarizeUnassignedTrainingEvidence(
      [],
      [
        { ...course('ai-practitioner', 'c1', 'COMPLETED', 100) },
        { ...course('ai-practitioner', 'c2', 'NOT_STARTED', 0) },
      ],
    );
    expect(evidence?.coursesWithProgress).toBe(1);
    expect(evidence?.averagePercent).toBe(100);
  });
});

describe('AdminMemberDetailPage program facts (S8, S12)', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['user.findFirst'] = async () => ({ ...baseMember });
  });

  it('S8: prints "No program enrolled" when there is no enrollment and no activity', async () => {
    const doc = await renderPage();
    expect(doc.body.textContent).toContain('No program enrolled');
    expect(doc.body.textContent).not.toContain('no enrollment on file');
    expect(doc.querySelector('[data-progress-source="unassigned-training-activity"]')).toBeNull();
  });

  it('S8: surfaces the training evidence for a member with progress but no enrollment pointer', async () => {
    db.overrides['user.findFirst'] = async () => ({
      ...baseMember,
      courseProgress: [
        { programSlug: 'it-support', courseSlug: 'c1', courseId: null, status: 'COMPLETED', percentComplete: 100, lastUpdatedAt: INSTANT },
        { programSlug: 'it-support', courseSlug: 'c2', courseId: null, status: 'COMPLETED', percentComplete: 100, lastUpdatedAt: INSTANT },
        { programSlug: 'it-support', courseSlug: 'c3', courseId: null, status: 'IN_PROGRESS', percentComplete: 1, lastUpdatedAt: INSTANT },
      ],
      memberProgramProgress: [
        { programSlug: 'comptia-a-plus', averagePercent: 0, coursesCompleted: 0, lastUpdatedAt: INSTANT },
      ],
    });

    const doc = await renderPage();
    const text = doc.body.textContent ?? '';
    expect(text).toContain('Training activity · no enrollment on file');
    const evidenceNodes = Array.from(doc.querySelectorAll('[data-progress-source="unassigned-training-activity"]'));
    expect(evidenceNodes.length).toBeGreaterThan(0);
    const evidenceText = evidenceNodes.map((n) => n.textContent ?? '').join(' ');
    expect(evidenceText).toContain('2 courses complete');
    // The arbitrary 0% comptia rollup must not become the shown program.
    expect(evidenceText).not.toContain('CompTIA');
  });

  it('S12: Enrolled date falls back to the CourseEnrollment row when User.enrolledAt is null', async () => {
    db.overrides['courseEnrollment.findFirst'] = async () => ({
      programSlug: 'it-support',
      curriculumVersion: 'legacy-v1',
      enrolledAt: new Date('2026-09-16T00:00:00Z'),
      enrolledByAdminId: null,
      fundingSource: null,
      fundingNotes: null,
      workspaceEmail: null,
      workspaceEmailProvisioned: false,
    });

    const doc = await renderPage({ tab: 'program' });
    const text = doc.body.textContent ?? '';
    expect(text).toContain('Sep 16, 2026');
    expect(text).not.toMatch(/Enrolled date:\s*—/);
  });

  it('S12: User.enrolledAt still wins when the enrollment row carries no date', async () => {
    db.overrides['user.findFirst'] = async () => ({
      ...baseMember,
      enrolledProgram: 'it-support',
      enrolledAt: new Date('2026-04-02T00:00:00Z'),
    });
    db.overrides['courseEnrollment.findFirst'] = async () => ({
      programSlug: 'it-support',
      curriculumVersion: 'legacy-v1',
      enrolledAt: null,
      enrolledByAdminId: null,
      fundingSource: null,
      fundingNotes: null,
      workspaceEmail: null,
      workspaceEmailProvisioned: false,
    });

    const doc = await renderPage({ tab: 'program' });
    expect(doc.body.textContent).toContain('Apr 2, 2026');
  });
});
