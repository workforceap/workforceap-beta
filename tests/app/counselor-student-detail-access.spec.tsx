import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withPortalIntl } from '@/tests/helpers/withPortalIntl';

/**
 * AUDIT-2026-05-16 §C-T1: the student-detail page must call the real
 * org-scoped helper before loading member PII. Route suites that mock
 * `assertStaffCanAccessMemberRecord` cannot catch a revert to global
 * `isAdmin()`.
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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/counselor/students/member-1',
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => false),
  isCounselor: vi.fn(async () => true),
  isSuperAdmin: vi.fn(async () => false),
  isAdminInOrg: vi.fn(async () => false),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
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
vi.mock('@/components/enrollment/EnrollmentAgreementCard', () => ({ default: () => null }));
vi.mock('@/components/counselor/StaffMemberResumePanel', () => ({ default: () => null }));
vi.mock('@/components/counselor/CounselorIntakeReviewPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/AwardPointsButton', () => ({ default: () => null }));
vi.mock('@/components/portal/PointsWidget', () => ({ default: () => null }));
vi.mock('@/components/portal/SkillsetProgressList', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/CounselorNotesPanel', () => ({ default: () => null }));
vi.mock('@/app/(portal)/counselor/students/[memberId]/AdvisorSessionNotesPanel', () => ({ default: () => null }));

import CounselorStudentDetailPage from '@/app/(portal)/counselor/students/[memberId]/page';
import { isAdmin, isAdminInOrg, isCounselor, isSuperAdmin } from '@/lib/auth/roles';

const INSTANT = new Date('2026-09-19T02:30:00Z');
const MEMBER_BLOB = {
  id: 'member-1',
  fullName: 'Fixture Member',
  email: 'fixture@example.com',
  enrolledProgram: null,
  courseraEnrollmentApproved: false,
  programInterest: null,
  assessmentScorePct: null,
  assessmentScore: null,
  assessmentCompleted: false,
  assessmentAttemptCount: 0,
  assessmentRetakeRequestedAt: null,
  assessmentHistory: [],
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
};

function memberRead(): ReturnType<typeof vi.fn> {
  const read = vi.fn(async () => MEMBER_BLOB);
  db.overrides['user.findFirst'] = read;
  return read;
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(
    withPortalIntl(await CounselorStudentDetailPage({
      params: Promise.resolve({ memberId: 'member-1' }),
    })),
  );
}

describe('CounselorStudentDetailPage org-scoped access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(isAdminInOrg).mockResolvedValue(false);
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1' });
    db.overrides['counselorAssignment.findFirst'] = async () => null;
    db.overrides['user.findUnique'] = async () => ({ organizationId: 'org-a' });
    memberRead();
  });

  it('lets a same-org admin open a member with no counselor assignment', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isCounselor).mockResolvedValue(false);
    vi.mocked(isAdminInOrg).mockImplementation(async (userId, orgId) => userId === 'staff-1' && orgId === 'org-a');
    db.overrides['counselor.findFirst'] = async () => null;
    const read = memberRead();

    const html = await renderPage();
    expect(html).toContain('Fixture Member');
    expect(isAdminInOrg).toHaveBeenCalledWith('staff-1', 'org-a');
    expect(read).toHaveBeenCalled();
  });

  it('withholds the member blob from a global admin who is not in the member org', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isCounselor).mockResolvedValue(false);
    db.overrides['counselor.findFirst'] = async () => null;
    const read = memberRead();

    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(isAdminInOrg).toHaveBeenCalledWith('staff-1', 'org-a');
    expect(read).not.toHaveBeenCalled();
  });

  it('lets a platform super-admin through without reading the member org', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isCounselor).mockResolvedValue(false);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    db.overrides['counselor.findFirst'] = async () => null;
    const orgLookup = vi.fn(async () => ({ organizationId: 'org-a' }));
    db.overrides['user.findUnique'] = orgLookup;
    const read = memberRead();

    const html = await renderPage();
    expect(html).toContain('Fixture Member');
    expect(orgLookup).not.toHaveBeenCalled();
    expect(isAdminInOrg).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalled();
  });
});
