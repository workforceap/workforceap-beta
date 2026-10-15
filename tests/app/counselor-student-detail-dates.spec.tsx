process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn(async () => new Map()) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/MemberProgressTimeline', () => ({ default: () => null }));
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

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

describe('CounselorStudentDetailPage dates and at-risk status', () => {
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
    });
    db.overrides['memberEvent.findMany'] = async (args) =>
      (args as { where?: { eventName?: unknown } })?.where?.eventName === 'pitch_deployed'
        ? [{ id: 'pitch-1', createdAt: INSTANT, metadata: { employer: 'Fixture Employer', usedAt: INSTANT.toISOString(), outcome: 'pending' } }]
        : [];
    db.overrides['atRiskAlert.findFirst'] = async () => ({
      score: 72,
      status: 'acknowledged',
      factors: [{ name: 'inactivity', weight: 30, description: 'No login in 14 days' }],
      createdAt: INSTANT,
    });
  });

  it('renders pitch and alert scan dates in Central time and labels the alert status', async () => {
    const html = renderToStaticMarkup(
      await CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }),
    );
    expect(html).toContain('Sep 18, 2026');
    expect(html).not.toContain('9/19/2026');
    expect(html).not.toContain('Sep 19');
    expect(html).toContain('>Acknowledged</strong>');
    expect(html).not.toContain('>acknowledged</strong>');
  });
});
