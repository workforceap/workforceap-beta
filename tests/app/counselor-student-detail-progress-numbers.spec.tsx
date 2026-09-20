process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Number correctness on the counselor student record (audit S10, S11).
 *
 * S10 — "Avg program: Nd" was 100 / mean(memberProgramProgress.average_percent)
 * * 30: a completion percentage inverted into a day count (375d for
 * software-dev, 1143d for ai-practitioner), unfiltered by org, time window or
 * completion, and it drove the per-stage "On track / Slower than avg" verdict.
 *
 * S11 — the Program Progress course list was built from a binary
 * completed-slug set, so courses the same reconciliation credits at 31-93%
 * rendered "Not started" directly under the header percentage that counts them.
 */

// The detail page fans out to ~20 prisma calls; a proxy returns a safe empty
// default for every model/method so the spec only pins the rows it asserts on.
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
  getOrCreateMemberCounselorThread: vi.fn(async () => null),
  serializeMessage: (m: unknown) => m,
}));
vi.mock('@/lib/member/points', () => ({ getMemberPoints: vi.fn(async () => null) }));
vi.mock('@/lib/billing/packetAccess', () => ({ listPacketsForMember: vi.fn(async () => []) }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));
// The real timeline renders here: S10 asserts the removed cohort caption.
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn(async () => new Map()) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorTrainingHandoff', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/admin/WioaScreeningReadonly', () => ({ default: () => null }));
vi.mock('@/components/admin/AssessmentAnswersReadonly', () => ({ default: () => null }));
vi.mock('@/components/billing/BillingPacketList', () => ({ default: () => null }));
vi.mock('@/components/counselor/StaffMemberResumePanel', () => ({ default: () => null }));
// Client panel (calls useRouter); stubbed like the other panels so the
// server render only exercises the page's own date formatting.
vi.mock('@/components/counselor/CounselorIntakeReviewPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/AwardPointsButton', () => ({ default: () => null }));
vi.mock('@/components/portal/PointsWidget', () => ({ default: () => null }));
vi.mock('@/components/portal/SkillsetProgressList', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/CounselorNotesPanel', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/AdvisorSessionNotesPanel', () => ({ default: () => null }));


import CounselorStudentDetailPage from '@/app/(portal)/counselor/students/[memberId]/page';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';

const INSTANT = new Date('2026-09-19T02:30:00Z');
const PROGRAM = 'it-automation-with-python-google';

const reconciled = (courseSlug: string, displayPercent: number, displayCompleted = false) => ({
  courseraCourseId: '',
  courseSlug,
  b4bPercent: null,
  b4bCompleted: null,
  localPercent: displayPercent,
  localStatus: displayCompleted ? ('COMPLETED' as const) : ('IN_PROGRESS' as const),
  displayPercent,
  displayCompleted,
  drift: 'ok' as const,
});

describe('CounselorStudentDetailPage program progress numbers', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => ({ id: 'assign-1' });
    db.overrides['user.findFirst'] = async () => ({
      id: 'member-1',
      fullName: 'Fixture Member',
      email: null,
      enrolledProgram: PROGRAM,
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
      courseEnrollments: [
        { programSlug: PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true, enrolledAt: INSTANT },
      ],
      profile: null,
    });
    db.overrides['memberEvent.findMany'] = async () => [];
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue({
      completedCount: 1,
      totalCourses: 6,
      progressPercentDisplay: 49,
      allCoursesComplete: false,
      nextIncompleteCourseSlug: 'python-operating-system',
      nextIncompleteCourseName: 'Using Python to Interact with the Operating System',
      hasStartedTraining: true,
      hasCompletedFirstCourse: true,
      lastTrainingActivityAt: INSTANT,
      averageGradePercentDisplay: null,
      completedSlugsAuthoritative: ['python-crash-course'],
      courseRows: [
        reconciled('python-crash-course', 100, true),
        reconciled('python-operating-system', 69),
        reconciled('introduction-git-github', 31),
        reconciled('troubleshooting-debugging-techniques', 87),
        reconciled('configuration-management-cloud', 93),
        reconciled('automating-real-world-tasks-python', 0),
      ],
      validatedCourseSlugs: [],
    });
  });

  async function renderPage(): Promise<Document> {
    const html = renderToStaticMarkup(
      await CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }),
    );
    const doc = document.implementation.createHTMLDocument('counselor student');
    doc.body.innerHTML = html;
    return doc;
  }

  it('S11: renders each course at the percent the header total already credits', async () => {
    const doc = await renderPage();
    const rows = Array.from(doc.querySelectorAll('[data-course-percent]'));
    expect(rows.map((el) => el.getAttribute('data-course-percent'))).toEqual(['100', '69', '31', '87', '93', '0']);

    const text = (slug: string) =>
      rows.find((el) => (el.textContent ?? '').length > 0 && el.getAttribute('data-course-percent') === slug);
    // The four partially-complete courses used to read "Not started".
    for (const pct of ['69', '31', '87', '93']) {
      expect(text(pct)?.textContent).toContain(`${pct}%`);
    }
    // Only the genuinely untouched course keeps the "Not started" label.
    const notStarted = rows.filter((el) => (el.textContent ?? '').includes('Not started'));
    expect(notStarted).toHaveLength(1);
    expect(notStarted[0].getAttribute('data-course-percent')).toBe('0');
    // The completed course is marked done, not given a percentage.
    expect(rows[0].getAttribute('data-done')).toBe('true');
  });

  it('S10: shows no "Avg program" caption and no On track / Slower than avg verdict', async () => {
    const doc = await renderPage();
    const text = doc.body.textContent ?? '';
    expect(text).toContain('Progress Timeline');
    expect(text).not.toContain('Avg program');
    expect(text).not.toContain('On track');
    expect(text).not.toContain('Slower than avg');
  });

  it('S10: never groups memberProgramProgress to derive a cohort duration', async () => {
    let grouped = false;
    db.overrides['memberProgramProgress.groupBy'] = async () => {
      grouped = true;
      return [];
    };
    await renderPage();
    expect(grouped).toBe(false);
  });
});
