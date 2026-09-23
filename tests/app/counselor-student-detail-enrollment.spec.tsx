process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * C05 part 2: the counselor member record reads the member's real enrollment
 * (the primary CourseEnrollment row, via resolveActiveDashboardProgram), not
 * the signup date and not only the legacy `User.enrolledProgram` pointer.
 *
 * - A member with no enrollment used to show their signup date (createdAt) as
 *   the Enrollment date, with a "0d" duration.
 * - A member with a primary CourseEnrollment row but a NULL legacy pointer (a
 *   real production case, WAP-76 comment of 2026-09-18) read as not enrolled:
 *   "At Risk", no program, Training and Certification Pending.
 * - The Enrollment date came from courseEnrollments[0], which is not always
 *   the primary row.
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
import { programDisplayTitle } from '@/lib/content/programTitle';

const SIGNUP = new Date('2026-01-05T15:00:00Z');
const PRIMARY_AT = new Date('2026-08-10T15:00:00Z');
const SECONDARY_AT = new Date('2026-03-02T15:00:00Z');
const PROGRAM = 'it-automation-with-python-google';
const SECONDARY_PROGRAM = 'google-data-analytics';

type Enrollment = {
  id: string;
  programSlug: string;
  curriculumVersion: string;
  isPrimary: boolean;
  enrolledAt: Date;
  fundingSource: string | null;
};

function memberRow(overrides: {
  enrolledProgram?: string | null;
  programInterest?: string | null;
  courseEnrollments?: Enrollment[];
}) {
  return {
    id: 'member-1',
    fullName: 'Fixture Member',
    email: 'fixture.member@example.test',
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
    createdAt: SIGNUP,
    courseEnrollments: [],
    profile: null,
    ...overrides,
  };
}

function enrollment(overrides: Partial<Enrollment>): Enrollment {
  return {
    id: 'enr-1',
    programSlug: PROGRAM,
    curriculumVersion: 'legacy-v1',
    isPrimary: true,
    enrolledAt: PRIMARY_AT,
    fundingSource: null,
    ...overrides,
  };
}

async function renderPage(): Promise<Document> {
  const html = renderToStaticMarkup(
    await CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }),
  );
  const doc = document.implementation.createHTMLDocument('counselor student');
  doc.body.innerHTML = html;
  return doc;
}

function stage(doc: Document, name: string): HTMLElement {
  const el = doc.querySelector<HTMLElement>(`[data-timeline-stage="${name}"]`);
  if (!el) throw new Error(`missing timeline stage ${name}`);
  return el;
}

/** The identity block: "program · email" line plus the status tag beside it. */
function identityText(doc: Document): string {
  const meta = [...doc.querySelectorAll('p')].find((p) => p.textContent?.includes('fixture.member@example.test'));
  if (!meta?.parentElement) throw new Error('missing identity block');
  return meta.parentElement.textContent ?? '';
}

const day = (d: Date) => d.toLocaleDateString();

describe('counselor member record reads the canonical enrollment (C05 part 2)', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => ({ id: 'assign-1' });
  });

  it('shows Enrollment as Pending with no date for a member who is not enrolled (never the signup date)', async () => {
    db.overrides['user.findFirst'] = async () => memberRow({ programInterest: PROGRAM });

    const doc = await renderPage();
    const enrollmentStage = stage(doc, 'enrollment');
    expect(enrollmentStage.dataset.timelineStatus).toBe('pending');
    expect(enrollmentStage.textContent).toContain('Pending');
    expect(enrollmentStage.textContent).not.toContain(day(SIGNUP));
    expect(enrollmentStage.textContent).not.toMatch(/\d+d\b/);
    // Not enrolled: training stays pending, the header falls back to the
    // program of interest and the badge still says the member is at risk.
    expect(stage(doc, 'training').dataset.timelineStatus).toBe('pending');
    expect(identityText(doc)).toContain(programDisplayTitle(PROGRAM));
    expect(identityText(doc)).toContain('At Risk');
  });

  it('treats a member with a primary enrollment row but a NULL legacy pointer as enrolled in that program', async () => {
    db.overrides['user.findFirst'] = async () =>
      memberRow({
        enrolledProgram: null,
        programInterest: SECONDARY_PROGRAM,
        courseEnrollments: [enrollment({})],
      });

    const doc = await renderPage();
    const text = identityText(doc);
    expect(text).toContain(programDisplayTitle(PROGRAM));
    // The interest is not the program once the member is enrolled.
    expect(text).not.toContain(programDisplayTitle(SECONDARY_PROGRAM));
    expect(text).toContain('On Track');
    expect(text).not.toContain('At Risk');

    const enrollmentStage = stage(doc, 'enrollment');
    expect(enrollmentStage.dataset.timelineStatus).toBe('completed');
    expect(enrollmentStage.textContent).toContain(day(PRIMARY_AT));
    expect(stage(doc, 'training').dataset.timelineStatus).toBe('in_progress');
    expect(stage(doc, 'certification').dataset.timelineStatus).toBe('in_progress');
  });

  it('dates Enrollment from the primary row even when it is not first in the array', async () => {
    db.overrides['user.findFirst'] = async () =>
      memberRow({
        enrolledProgram: null,
        courseEnrollments: [
          enrollment({ id: 'enr-2', programSlug: SECONDARY_PROGRAM, isPrimary: false, enrolledAt: SECONDARY_AT }),
          enrollment({ id: 'enr-1' }),
        ],
      });

    const doc = await renderPage();
    const enrollmentStage = stage(doc, 'enrollment');
    expect(enrollmentStage.textContent).toContain(day(PRIMARY_AT));
    expect(enrollmentStage.textContent).not.toContain(day(SECONDARY_AT));
    expect(identityText(doc)).toContain(programDisplayTitle(PROGRAM));
  });
});
