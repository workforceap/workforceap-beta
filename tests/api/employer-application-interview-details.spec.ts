/**
 * Vision B2 (V09): an employer records when and where an interview is on the
 * application (PATCH /api/employer/applications/[id]), and the member gets
 * exactly one in-app notification per distinct interview time.
 *
 * The real lib/employer/applicationStatusEffects runs here (wrapped in a spy)
 * so the tests count the createNotification calls the member actually gets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Work scheduled with next/server `after()`; patch() waits for it to settle.
const pendingAfter: Promise<unknown>[] = [];

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
    after: (fn: () => unknown) => {
      pendingAfter.push(Promise.resolve(fn()));
    },
  };
});

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  getEmployerForUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const mockPrisma: any = {
    jobPostingApplication: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    employer: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => (typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn))),
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: vi.fn((handler: Function) => handler),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/placement/recordPlacementFromApplication', () => ({
  recordPlacementFromApplication: vi.fn(async () => ({ outcome: 'unchanged' })),
}));

vi.mock('@/lib/employer/applicationStatusEffects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/employer/applicationStatusEffects')>();
  return { ...actual, notifyAndRecordPlacement: vi.fn(actual.notifyAndRecordPlacement) };
});

import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/employer/applications/[id]/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { notifyAndRecordPlacement } from '@/lib/employer/applicationStatusEffects';

const EMPLOYER_A = 'emp-a';
const EMPLOYER_B = 'emp-b';
const APP_ID = 'app-1';
const T1 = '2026-10-02T19:30:00.000Z'; // Oct 2, 2:30 PM CDT
const T2 = '2026-10-03T15:00:00.000Z'; // Oct 3, 10:00 AM CDT

const findFirst = () => vi.mocked(prisma.jobPostingApplication.findFirst);
const updateMany = () => vi.mocked(prisma.jobPostingApplication.updateMany);
const notify = () => vi.mocked(createNotification);
const effect = () => vi.mocked(notifyAndRecordPlacement);

type Stored = { status: string; interviewScheduledAt?: string | null; interviewNotes?: string | null };

function row(stored: Stored) {
  return {
    id: APP_ID,
    jobId: 'job-1',
    studentId: 'member-1',
    employerNotes: null,
    status: stored.status,
    interviewScheduledAt: stored.interviewScheduledAt ? new Date(stored.interviewScheduledAt) : null,
    interviewNotes: stored.interviewNotes ?? null,
  };
}

/**
 * The route reads the application (ownership + current values), writes with a
 * compare-and-swap, then re-reads. The re-read reflects the data written.
 */
function stored(before: Stored) {
  findFirst().mockImplementation((async (args: any) => {
    if (args?.where?.job?.employerId !== EMPLOYER_A) return null;
    const lastWrite = updateMany().mock.calls.at(-1)?.[0] as any;
    if (!lastWrite) return row(before);
    const data = lastWrite.data;
    return {
      ...row(before),
      ...(data.status ? { status: data.status } : {}),
      ...('interviewScheduledAt' in data ? { interviewScheduledAt: data.interviewScheduledAt } : {}),
      ...('interviewNotes' in data ? { interviewNotes: data.interviewNotes } : {}),
    };
  }) as never);
}

function signInAs(employerId: string) {
  vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
  vi.mocked(getEmployerForUser).mockResolvedValue({ employerId } as never);
}

async function patch(body: Record<string, unknown>) {
  const res = await PATCH(
    new NextRequest(`http://localhost:3000/api/employer/applications/${APP_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: APP_ID }) },
  );
  await Promise.all(pendingAfter.splice(0));
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst().mockReset();
  updateMany().mockReset();
  updateMany().mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.jobPostingApplication.findUnique).mockResolvedValue({ job: { title: 'Fixture Role' } } as never);
  signInAs(EMPLOYER_A);
});

describe('interview time and place on an application already at Interview', () => {
  it('setting a time persists interviewScheduledAt and sends exactly one notification with the time and place', async () => {
    stored({ status: 'interview' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: 'Zoom — link to follow' });

    expect(res.status).toBe(200);
    const write = updateMany().mock.calls[0][0] as any;
    expect(write.data.interviewScheduledAt).toEqual(new Date(T1));
    expect(write.data.interviewNotes).toBe('Zoom — link to follow');
    expect(notify()).toHaveBeenCalledTimes(1);
    const sent = notify().mock.calls[0][0] as any;
    expect(sent).toMatchObject({
      userId: 'member-1',
      type: 'application_update',
      title: 'Interview time set',
      data: { link: '/dashboard/jobs', applicationId: APP_ID },
    });
    expect(sent.body).toContain('Scheduled for Oct 2, 2026, 2:30 PM CDT · Zoom — link to follow');
    expect(effect()).not.toHaveBeenCalled();
  });

  it('re-saving the same time sends nothing', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1, interviewNotes: 'Zoom' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: 'Zoom' });
    expect(res.status).toBe(200);
    expect(notify()).not.toHaveBeenCalled();
  });

  it('changing to a new time sends one notification with the new time', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1, interviewNotes: 'Zoom' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T2, interviewLocation: 'Zoom' });
    expect(res.status).toBe(200);
    expect(notify()).toHaveBeenCalledTimes(1);
    expect((notify().mock.calls[0][0] as any).body).toContain('Scheduled for Oct 3, 2026, 10:00 AM CDT · Zoom');
  });

  it('a new time only wins the write if the stored time is still the one that was read', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1 });
    await patch({ status: 'interview', interviewScheduledAt: T2 });
    const write = updateMany().mock.calls[0][0] as any;
    expect(write.where).toMatchObject({ id: APP_ID, status: 'interview', interviewScheduledAt: new Date(T1) });
  });

  it('a location-only change is stored and sends nothing', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1, interviewNotes: 'Zoom' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: '12 Main St, Suite 4' });
    expect(res.status).toBe(200);
    expect((updateMany().mock.calls[0][0] as any).data.interviewNotes).toBe('12 Main St, Suite 4');
    expect(notify()).not.toHaveBeenCalled();
  });

  it('an empty location clears the stored place', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1, interviewNotes: 'Zoom' });
    await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: '   ' });
    expect((updateMany().mock.calls[0][0] as any).data.interviewNotes).toBeNull();
    expect(notify()).not.toHaveBeenCalled();
  });

  it('a 501-character location returns 400 with no write', async () => {
    stored({ status: 'interview' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(updateMany()).not.toHaveBeenCalled();
    expect(notify()).not.toHaveBeenCalled();
  });
});

describe('moving to Interview together with a time', () => {
  it('reviewing -> interview with a time sends exactly one notification, and it carries the time', async () => {
    stored({ status: 'reviewing' });
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: 'Phone call' });

    expect(res.status).toBe(200);
    expect(effect()).toHaveBeenCalledTimes(1);
    expect(effect().mock.calls[0][0]).toMatchObject({
      nextStatus: 'interview',
      interview: { at: new Date(T1), location: 'Phone call' },
    });
    expect(notify()).toHaveBeenCalledTimes(1);
    const sent = notify().mock.calls[0][0] as any;
    expect(sent.title).toBe('You have an interview request');
    expect(sent.body).toBe(
      'The employer wants to move forward on your application for Fixture Role. Check the details and respond.' +
        ' Scheduled for Oct 2, 2026, 2:30 PM CDT · Phone call',
    );
  });

  it('reviewing -> interview with no time keeps the existing interview notification copy', async () => {
    stored({ status: 'reviewing' });
    await patch({ status: 'interview' });
    expect(effect()).toHaveBeenCalledTimes(1);
    expect((effect().mock.calls[0][0] as any).interview).toBeUndefined();
    expect(notify()).toHaveBeenCalledTimes(1);
    expect((notify().mock.calls[0][0] as any).body).toBe(
      'The employer wants to move forward on your application for Fixture Role. Check the details and respond.',
    );
  });
});

describe('a time only belongs to an application at Interview', () => {
  it('a time while the status is reviewing returns 400 with no write', async () => {
    stored({ status: 'reviewing' });
    const res = await patch({ status: 'reviewing', interviewScheduledAt: T1 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'interview_time_requires_interview_status' });
    expect(updateMany()).not.toHaveBeenCalled();
    expect(notify()).not.toHaveBeenCalled();
  });

  it('a time on a move out of Interview returns 400 with no write', async () => {
    stored({ status: 'interview', interviewScheduledAt: T1 });
    const res = await patch({ status: 'offered', interviewScheduledAt: T2 });
    expect(res.status).toBe(400);
    expect(updateMany()).not.toHaveBeenCalled();
  });

  it.each(['interview', 'offered', 'rejected'])('null clears the time while %s, with no notification', async (status) => {
    stored({ status, interviewScheduledAt: T1 });
    const res = await patch({ status, interviewScheduledAt: null });
    expect(res.status).toBe(200);
    expect((updateMany().mock.calls[0][0] as any).data.interviewScheduledAt).toBeNull();
    expect(notify()).not.toHaveBeenCalled();
  });
});

describe('authorization', () => {
  it('unauthenticated returns 401 with no read or write', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await patch({ status: 'interview', interviewScheduledAt: T1 });
    expect(res.status).toBe(401);
    expect(findFirst()).not.toHaveBeenCalled();
    expect(updateMany()).not.toHaveBeenCalled();
  });

  it('a signed-in non-employer returns 403 with no read or write', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(null as never);
    const res = await patch({ status: 'interview', interviewScheduledAt: T1 });
    expect(res.status).toBe(403);
    expect(findFirst()).not.toHaveBeenCalled();
    expect(updateMany()).not.toHaveBeenCalled();
  });

  it("employer B on employer A's application returns 404 with no write and no notification", async () => {
    stored({ status: 'interview' });
    signInAs(EMPLOYER_B);
    const res = await patch({ status: 'interview', interviewScheduledAt: T1, interviewLocation: 'Zoom' });
    expect(res.status).toBe(404);
    expect(findFirst().mock.calls[0][0]).toMatchObject({ where: { id: APP_ID, job: { employerId: EMPLOYER_B } } });
    expect(updateMany()).not.toHaveBeenCalled();
    expect(notify()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });
});
