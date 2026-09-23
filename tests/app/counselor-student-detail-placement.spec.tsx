process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * C05: the counselor member timeline reads the staff placement record
 * (PlacementRecord, one row per member), not the `placement_recorded` member
 * event. /api/admin/placements and the employer-hire / member self-report path
 * (lib/placement/recordPlacementFromApplication.ts) create a PlacementRecord
 * without that event, so a placed member used to read "Pending". An event
 * without a record is not a placement. An unverified start date says so.
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

const INSTANT = new Date('2026-09-01T15:00:00Z');

function placementStage(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('[data-timeline-stage="placement"]');
}

describe('counselor member timeline placement stage (C05)', () => {
  let placementQuery: unknown;
  let eventQuery: unknown;

  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    placementQuery = undefined;
    eventQuery = undefined;
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
    db.overrides['memberEvent.findMany'] = async (args) => {
      eventQuery = args;
      return [];
    };
  });

  async function renderPage(): Promise<Document> {
    const html = renderToStaticMarkup(
      await CounselorStudentDetailPage({ params: Promise.resolve({ memberId: 'member-1' }) }),
    );
    const doc = document.implementation.createHTMLDocument('counselor student');
    doc.body.innerHTML = html;
    return doc;
  }

  it('marks the member placed from a PlacementRecord that has no placement_recorded event, and flags the unverified start date', async () => {
    db.overrides['placementRecord.findUnique'] = async (args) => {
      placementQuery = args;
      return {
        placedAt: new Date('2026-09-15T16:00:00Z'),
        startDate: null,
        startDateVerified: false,
      };
    };

    const doc = await renderPage();
    const stage = placementStage(doc);
    expect(stage).not.toBeNull();
    expect(stage?.dataset.timelineStatus).toBe('completed');
    expect(stage?.textContent).toContain('Start date not yet verified');
    expect(stage?.textContent).not.toContain('Pending');
    expect(placementQuery).toMatchObject({ where: { userId: 'member-1' } });
  });

  it('shows a verified start date as verified, formatted as a calendar date', async () => {
    db.overrides['placementRecord.findUnique'] = async () => ({
      placedAt: new Date('2026-09-15T16:00:00Z'),
      // @db.Date column: midnight UTC, must not slide to the previous day.
      startDate: new Date('2026-10-01T00:00:00Z'),
      startDateVerified: true,
    });

    const stage = placementStage(await renderPage());
    expect(stage?.dataset.timelineStatus).toBe('completed');
    expect(stage?.textContent).toContain('Start date Oct 1, 2026 (verified)');
    expect(stage?.textContent).not.toContain('not yet verified');
  });

  it('never infers a placement from a placement_recorded event without a PlacementRecord', async () => {
    db.overrides['memberEvent.findMany'] = async (args) => {
      eventQuery = args;
      return [{ eventName: 'placement_recorded', createdAt: new Date('2026-09-10T12:00:00Z') }];
    };
    db.overrides['placementRecord.findUnique'] = async () => null;

    const stage = placementStage(await renderPage());
    expect(stage?.dataset.timelineStatus).toBe('pending');
    expect(stage?.textContent).toContain('Pending');
    expect(stage?.textContent).not.toContain('verified');
    // The event is no longer part of the milestone fetch at all.
    expect(JSON.stringify(eventQuery)).not.toContain('placement_recorded');
  });

  it('keeps "in progress" for a member with applications but no placement record', async () => {
    db.overrides['placementRecord.findUnique'] = async () => null;
    db.overrides['jobPostingApplication.count'] = async () => 2;

    const stage = placementStage(await renderPage());
    expect(stage?.dataset.timelineStatus).toBe('in_progress');
  });
});
