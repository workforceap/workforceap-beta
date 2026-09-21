import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Four code paths move `job_applications.status`; before this suite only one
 * of them told the member activity log. These specs pin all four on one event
 * shape, so a status change made through the sibling PATCH route, the job
 * board or placement confirmation is no longer invisible.
 *
 * This recovers nothing about the past — every change before it shipped is
 * gone — and it does not give the "Active jobs" tile a trend. It stops the
 * hole growing.
 */

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => {}) }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
  withUserGuc: vi.fn(async (_user: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => ({ awarded: true })) }));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => {}),
  persistEvent: vi.fn(async () => ({})),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    jobApplication: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    partnerReferral: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(),
  },
}));

import { PATCH as patchApplication } from '@/app/api/member/applications/[id]/route';
import { confirmPlacement } from '@/app/(portal)/dashboard/placementAction';
import { syncCuratedJobToTracker } from '@/lib/jobs/syncCuratedJobToTracker';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { persistEvent, trackEvent } from '@/lib/events/track';

const MEMBER_ID = 'member-abc';
const APPLICATION_ID = 'app-123';

type EventParams = {
  userId: string;
  eventName: string;
  entityType?: string;
  entityId?: string;
  sourcePage?: string;
  metadata?: Record<string, unknown>;
};

/** Every event either writer was handed, from both the best-effort and durable paths. */
function emitted(): EventParams[] {
  return [
    ...vi.mocked(trackEvent).mock.calls.map((call) => call[0] as unknown as EventParams),
    ...vi.mocked(persistEvent).mock.calls.map((call) => call[0] as unknown as EventParams),
  ];
}

function statusEvents(): EventParams[] {
  return emitted().filter((event) => event.eventName === 'application_status_changed');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: MEMBER_ID, email: 'member@example.com' } as never);
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never,
  );
  vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue(null as never);
});

function patchRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/member/applications/${APPLICATION_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchContext() {
  return { params: Promise.resolve({ id: APPLICATION_ID }) };
}

describe('PATCH /api/member/applications/[id] — the sibling route that logged nothing', () => {
  it('emits application_status_changed with both the stage and the raw status', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'APPLIED',
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({
      id: APPLICATION_ID,
      status: 'INTERVIEWING',
    } as never);

    const response = await (patchApplication as unknown as (
      request: Request,
      context: ReturnType<typeof patchContext>,
    ) => Promise<Response>)(patchRequest({ status: 'INTERVIEWING' }), patchContext());
    expect(response.status).toBe(200);

    const events = statusEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: MEMBER_ID,
      entityType: 'job_application',
      entityId: APPLICATION_ID,
      sourcePage: '/dashboard/job-applications',
      metadata: {
        previousStatus: 'APPLIED',
        nextStatus: 'INTERVIEWING',
        previousDbStatus: 'APPLIED',
        nextDbStatus: 'INTERVIEWING',
      },
    });
  });

  it('records SAVED -> APPLIED, which the stage vocabulary alone cannot express', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'SAVED',
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({
      id: APPLICATION_ID,
      status: 'APPLIED',
    } as never);

    await (patchApplication as unknown as (
      request: Request,
      context: ReturnType<typeof patchContext>,
    ) => Promise<Response>)(patchRequest({ status: 'APPLIED' }), patchContext());

    const events = statusEvents();
    expect(events).toHaveLength(1);
    // getJobApplicationStage folds SAVED and APPLIED into one stage, so the
    // stage pair below is a no-op pair — the db statuses are what make the
    // member actually applying recoverable from the log.
    expect(events[0].metadata).toMatchObject({
      previousStatus: 'APPLIED',
      nextStatus: 'APPLIED',
      previousDbStatus: 'SAVED',
      nextDbStatus: 'APPLIED',
    });
  });

  it('stays quiet when the PATCH does not move the status', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'APPLIED',
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({
      id: APPLICATION_ID,
      status: 'APPLIED',
    } as never);

    await (patchApplication as unknown as (
      request: Request,
      context: ReturnType<typeof patchContext>,
    ) => Promise<Response>)(patchRequest({ notes: 'called the recruiter' }), patchContext());
    expect(statusEvents()).toHaveLength(0);

    await (patchApplication as unknown as (
      request: Request,
      context: ReturnType<typeof patchContext>,
    ) => Promise<Response>)(patchRequest({ status: 'APPLIED' }), patchContext());
    expect(statusEvents()).toHaveLength(0);
  });
});

describe('syncCuratedJobToTracker — the job board path', () => {
  const job = { id: 'job-77', title: 'Help Desk Tech', employer: { companyName: 'Acme' } };

  it('logs the saved-then-applied move the job board makes on the member behalf', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'SAVED',
      appliedAt: null,
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({
      id: APPLICATION_ID,
      status: 'APPLIED',
    } as never);

    await syncCuratedJobToTracker(MEMBER_ID, job, { status: 'APPLIED', markAppliedDate: true });

    const events = statusEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: MEMBER_ID,
      entityId: APPLICATION_ID,
      sourcePage: '/dashboard/jobs/job-77',
      metadata: { previousDbStatus: 'SAVED', nextDbStatus: 'APPLIED' },
    });
  });

  it('says nothing when the sync re-writes the same status', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'APPLIED',
      appliedAt: new Date(),
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({
      id: APPLICATION_ID,
      status: 'APPLIED',
    } as never);

    await syncCuratedJobToTracker(MEMBER_ID, job, { status: 'APPLIED', markAppliedDate: true });
    expect(statusEvents()).toHaveLength(0);
  });

  it('treats a first-time tracker row as a creation, not a transition', async () => {
    vi.mocked(prisma.jobApplication.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.jobApplication.create).mockResolvedValue({
      id: 'app-new',
      status: 'SAVED',
    } as never);

    await syncCuratedJobToTracker(MEMBER_ID, job, { status: 'SAVED', markAppliedDate: false });
    expect(statusEvents()).toHaveLength(0);
    expect(prisma.jobApplication.create).toHaveBeenCalledTimes(1);
  });
});

describe('confirmPlacement — the path that forced ACCEPTED under a differently named event', () => {
  it('logs the status move alongside the placement claim', async () => {
    vi.mocked(prisma.jobApplication.findUnique).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'OFFER',
      company: 'Acme',
      role: 'Help Desk Tech',
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({ id: APPLICATION_ID } as never);

    await confirmPlacement(APPLICATION_ID);

    const names = emitted().map((event) => event.eventName);
    expect(names).toContain('placement_confirmation_submitted');
    const events = statusEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: MEMBER_ID,
      entityId: APPLICATION_ID,
      sourcePage: '/dashboard',
      metadata: { previousDbStatus: 'OFFER', nextDbStatus: 'ACCEPTED' },
    });
  });

  it('claims no status change when the application was already ACCEPTED', async () => {
    vi.mocked(prisma.jobApplication.findUnique).mockResolvedValue({
      id: APPLICATION_ID,
      userId: MEMBER_ID,
      status: 'ACCEPTED',
      company: 'Acme',
      role: 'Help Desk Tech',
    } as never);
    vi.mocked(prisma.jobApplication.update).mockResolvedValue({ id: APPLICATION_ID } as never);

    await confirmPlacement(APPLICATION_ID);

    expect(statusEvents()).toHaveLength(0);
    expect(emitted().map((event) => event.eventName)).toContain('placement_confirmation_submitted');
  });
});
