import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

/**
 * Prisma stand-in for the server pages: every `prisma.<model>.<method>` resolves
 * to an empty result unless a test sets `db.overrides['model.method']` (the
 * counselor-student-detail-tabs pattern), so each page renders with only the
 * rows the case is about.
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

/**
 * A `pending` and a `rejected` JobPostingApplication rendered on every
 * employer surface that shows the status, plus the counselor's read of the
 * member's record. The employer reads "New" / "Not selected" (the pipeline as
 * they work it); the counselor reads "Applied" / "Not selected" (the member's
 * journey). No surface says "Pending", "Under Review", "Offer", "Declined" or
 * "Rejected" any more, and none title-cases the enum.
 *
 * #2500 follow-up: the counselor member record, the employer home (through
 * the real EmployerHomeKit) and the employer candidate profile are rendered
 * too, and their `.wa-kit-tag` elements are read from the HTML — not the
 * label helper.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/employer/applications',
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/lib/analytics/events', () => ({
  trackEmployerJobAction: vi.fn(),
  trackEmployerBulkDelete: vi.fn(),
  trackEmployerImport: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));
// Server page (employer application detail) collaborators.
vi.mock('@/app/seo', () => ({ buildPageMetadata: vi.fn(), buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
  isAdmin: vi.fn(async () => false),
  isCounselor: vi.fn(async () => true),
}));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
// Employer home collaborators that need a browser or a network.
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
// Counselor member-record collaborators (the counselor-student-detail-tabs set).
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn(async () => true) }));
vi.mock('@/lib/messages/counselorThread', () => ({
  compactStringIds: (ids: Array<string | null>) => ids.filter((id): id is string => typeof id === 'string'),
  getMessageAuthorName: () => 'Staff',
  getOrCreateMemberCounselorThread: vi.fn(async () => ({
    id: 'thread-1', memberId: 'member-1', counselorUserId: 'staff-1', memberLastReadAt: null, counselorLastReadAt: null,
  })),
  serializeMessage: (m: unknown) => m,
}));
vi.mock('@/lib/member/points', () => ({ getMemberPoints: vi.fn(async () => null) }));
vi.mock('@/lib/billing/packetAccess', () => ({ listPacketsForMember: vi.fn(async () => []) }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn(async () => new Map()) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/components/portal/counselor/MemberProgressTimeline', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorTrainingHandoff', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminMemberCounselorChatClient', () => ({ default: () => null }));
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

import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerApplicationsClient, { type EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import JobApplicantsClient from '@/components/employer/JobApplicantsClient';
import EmployerWorkQueueClient from '@/components/employer/EmployerWorkQueueClient';
import ApplicationStatusUpdater from '@/components/employer/ApplicationStatusUpdater';
import EmployerApplicationPage from '@/app/(portal)/employer/applications/[id]/page';
import EmployerDashboardPage from '@/app/(portal)/employer/page';
import EmployerCandidateProfilePage from '@/app/(portal)/employer/candidates/[studentId]/page';
import CounselorStudentDetailPage from '@/app/(portal)/counselor/students/[memberId]/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  for (const key of Object.keys(db.overrides)) delete db.overrides[key];
});

const OLD_WORDS = /\b(Pending|Under Review|Offered|Declined|Rejected)\b/;

const row = (id: string, status: string, fullName: string): EmployerApplicationRow => ({
  id,
  jobId: 'job-1',
  status,
  appliedAt: '2026-09-01T00:00:00Z',
  employerNotes: null,
  job: { id: 'job-1', title: 'Warehouse Associate' },
  student: { id: `s-${id}`, fullName, email: `${id}@example.test` },
});

function withMessages(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('employer surfaces: a new and a not-selected application', () => {
  it('mobile list: pill, filter chips and the move-to button all speak the employer words', () => {
    withMessages(<MobileApplicationsClient initialRows={[row('a1', 'pending', 'Ada Applicant'), row('a2', 'rejected', 'Rex Applicant')]} />);
    const tagFor = (label: string) => screen.getByText(label, { selector: '.wa-kit-tag' });
    expect(tagFor('New')).toBeInTheDocument();
    expect(tagFor('Not selected')).toBeInTheDocument();
    // Filter chips: one per stage, in the vocabulary's words.
    for (const key of ['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected'] as const) {
      expect(screen.getAllByRole('button', { name: jobApplicationStatusLabel(key, 'employer') }).length).toBeGreaterThanOrEqual(1);
    }
    // The move-to action on a new application is the next stage's word.
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for Ada Applicant' }));
    const details = document.getElementById('application-details-a1') as HTMLElement;
    expect(within(details).getByRole('button', { name: 'Reviewing' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('applications table: the filter chips and the per-row stage <select> speak the employer words', () => {
    withMessages(<EmployerApplicationsClient initialRows={[row('a1', 'pending', 'Ada Applicant')]} activeStatusFilter={null} activeSort="applied_desc" />);
    const select = screen.getByLabelText('Pipeline stage for Ada Applicant') as HTMLSelectElement;
    const optionWords = Array.from(select.options).map((o) => o.textContent);
    expect(optionWords).toEqual(['New', 'Reviewing', 'Interviewing', 'Offer extended', 'Hired', 'Not selected']);
    expect(select.selectedOptions[0]?.textContent).toBe('New');
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('per-job applicants list: the stage <select> speaks the employer words', () => {
    withMessages(
      <JobApplicantsClient
        jobId="job-1"
        initialApplicants={[{ id: 'a1', status: 'rejected', appliedAt: '2026-09-01T00:00:00Z', employerNotes: null, student: { id: 's1', fullName: 'Rex Applicant', email: 'rex@example.test' } }]}
      />,
    );
    // The list renders a desktop table and a mobile card list; both selects carry the same label.
    const select = screen.getAllByLabelText('Update application status for Rex Applicant')[0] as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Not selected');
    // Only the stage it is in plus the moves the server accepts (lib/employer/applicationStatus.ts).
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['New', 'Not selected']);
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('work queue: a pending application in "Review today" reads "New", not the title-cased enum', () => {
    withMessages(
      <EmployerWorkQueueClient
        needsReviewTodayApps={[{ id: 'a1', jobId: 'job-1', status: 'pending', appliedAt: '2026-09-01T00:00:00Z', jobTitle: 'Warehouse Associate', studentName: 'Ada Applicant', studentId: 's1' }]}
        jobsAwaitingPublish={[]}
        staleApps={[]}
        interviewPending={[]}
      />,
    );
    const tag = Array.from(document.querySelectorAll<HTMLElement>('.wa-kit-tag')).find((el) => el.textContent === 'New');
    expect(tag, 'status tag on the review-today row').toBeDefined();
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('status updater: the <select> offers the current and allowed next stages in the employer words', () => {
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="offered" />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Interviewing', 'Offer extended', 'Hired', 'Not selected']);
    expect(select.selectedOptions[0]?.textContent).toBe('Offer extended');
  });
});

describe('employer application detail page', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
  });

  it.each([
    ['pending', 'New'],
    ['rejected', 'Not selected'],
  ])('reads the employer word for %s in the Current Status tag', async (status, word) => {
    db.overrides['jobPostingApplication.findFirst'] = async () => ({
      id: 'app-1',
      status,
      notes: null,
      job: { id: 'job-1', title: 'Fixture Role', employerId: 'emp-1' },
      student: { id: 'member-1', fullName: 'Fixture Candidate', email: null, phone: null, enrolledProgram: null, profile: null },
      messages: [],
    });
    const html = renderToStaticMarkup(await EmployerApplicationPage({ params: Promise.resolve({ id: 'app-1' }) }));
    const tag = html.match(/<span[^>]*class="[^"]*wa-kit-tag[^"]*"[^>]*>([^<]*)<\/span>/);
    expect(tag?.[1], 'kit status tag').toBe(word);
    expect(html).not.toMatch(/>(Pending|Rejected|Offered|Interview)</);
  });
});

describe('counselor read of the member record', () => {
  it('speaks the member journey, not the employer queue', () => {
    expect(jobApplicationStatusLabel('pending', 'member')).toBe('Applied');
    expect(jobApplicationStatusLabel('reviewing', 'member')).toBe('Under review');
    expect(jobApplicationStatusLabel('rejected', 'member')).toBe('Not selected');
  });
});

// ── rendered pages: the words in the `.wa-kit-tag` elements ────────────────
const INSTANT = new Date('2026-09-01T12:00:00Z');
/** A pending and a rejected application on job-1 for the fixture member; `job`/`student` shaped per page's `include`. */
const APPLICATIONS = [
  { id: 'app-p', jobId: 'job-1', studentId: 'member-1', status: 'pending', appliedAt: INSTANT, notes: null, employerNotes: null },
  { id: 'app-r', jobId: 'job-2', studentId: 'member-1', status: 'rejected', appliedAt: INSTANT, notes: null, employerNotes: null },
];
const JOB = (id: string) => ({ id, title: id === 'job-1' ? 'Warehouse Associate' : 'Forklift Operator', employerId: 'emp-1', employer: { companyName: 'Fixture Co' } });

/** Server-render a page (the kits inside read next-intl), parse the HTML, and return every `.wa-kit-tag` text. */
async function kitTagsOf(page: Promise<React.ReactElement>): Promise<string[]> {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">{await page}</NextIntlClientProvider>,
  );
  const doc = document.implementation.createHTMLDocument('page');
  doc.body.innerHTML = html;
  return Array.from(doc.querySelectorAll<HTMLElement>('.wa-kit-tag'), (el) => el.textContent ?? '');
}

describe('rendered status tags (from the page HTML, not the helper)', () => {
  it('counselor member record: the applications list tags read the member words "Applied" / "Not selected"', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'staff-1' } as never);
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => ({ id: 'assign-1' });
    db.overrides['user.findFirst'] = async () => ({
      id: 'member-1', fullName: 'Fixture Member', email: 'fixture@example.com', enrolledProgram: null, courseraEnrollmentApproved: false,
      programInterest: null, assessmentScorePct: null, assessmentScore: null, assessmentCompleted: false, assessmentCompletedAt: null,
      assessmentAnswers: null, wioaQualificationJson: null, wioaReviewStatus: null, wioaReviewedAt: null, wioaReviewedByUserId: null,
      wioaReviewNotes: null, careerRecommendationJson: null, createdAt: INSTANT, courseEnrollments: [], profile: null,
    });
    db.overrides['jobPostingApplication.count'] = async () => APPLICATIONS.length;
    db.overrides['jobPostingApplication.findMany'] = async () => APPLICATIONS.map((a) => ({ ...a, job: JOB(a.jobId) }));

    const tags = await kitTagsOf(CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }));
    expect(tags).toContain('Applied');
    expect(tags).toContain('Not selected');
    // The counselor never reads the employer queue's "New".
    expect(tags).not.toContain('New');
    for (const tag of tags) expect(tag).not.toMatch(OLD_WORDS);
  });

  it('employer home (EmployerHomeKit): the candidate rows tag "New" / "Not selected"', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1', employer: { companyName: 'Fixture Co', status: 'active' } } as never);
    db.overrides['job.count'] = async () => 1;
    db.overrides['jobPostingApplication.count'] = async () => APPLICATIONS.length;
    db.overrides['jobPostingApplication.findMany'] = async () =>
      APPLICATIONS.map((a) => ({ ...a, job: { title: JOB(a.jobId).title }, student: { fullName: 'Fixture Candidate' } }));

    const tags = await kitTagsOf(EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(tags).toContain('New');
    expect(tags).toContain('Not selected');
    expect(tags).not.toContain('Applied');
    for (const tag of tags) expect(tag).not.toMatch(OLD_WORDS);
  });

  it('employer candidate profile: the application tags read "New" / "Not selected"', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
    db.overrides['aIJobMatch.findMany'] = async () => [
      { id: 'match-1', jobId: 'job-1', studentId: 'member-1', matchScore: 0.8, status: 'suggested', createdAt: INSTANT, job: { id: 'job-1', title: 'Warehouse Associate' } },
    ];
    db.overrides['aIJobMatch.count'] = async () => 1;
    db.overrides['jobPostingApplication.count'] = async () => APPLICATIONS.length;
    db.overrides['jobPostingApplication.findMany'] = async () => APPLICATIONS.map((a) => ({ ...a, job: JOB(a.jobId) }));
    db.overrides['user.findUnique'] = async () => ({
      fullName: 'Fixture Candidate', email: 'fixture@example.test', enrolledProgram: null, assessmentCompleted: false,
      courseEnrollments: [], courseProgress: [], profile: null,
    });

    const tags = await kitTagsOf(EmployerCandidateProfilePage({ params: Promise.resolve({ studentId: 'member-1' }), searchParams: Promise.resolve({}) }));
    expect(tags).toContain('New');
    expect(tags).toContain('Not selected');
    expect(tags).not.toContain('Applied');
    for (const tag of tags) expect(tag).not.toMatch(OLD_WORDS);
  });
});
