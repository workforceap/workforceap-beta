/**
 * Vision B1 (V09): both employer writers of JobPostingApplication.status go
 * through the transition map in lib/employer/applicationStatus.ts and a
 * compare-and-swap on the status that was read, and the member-facing side
 * effect runs once per real move (via next/server `after`).
 *
 *  - PATCH /api/employer/applications/[id]
 *  - PATCH /api/employer/jobs/[id]/applicants?applicantId=
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    after: (fn: () => unknown) => fn(),
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
    job: { findFirst: vi.fn() },
    jobPostingApplication: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => (typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn))),
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: vi.fn((handler: Function) => handler),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/employer/applicationStatusEffects', () => ({
  notifyAndRecordPlacement: vi.fn(() => Promise.resolve()),
}));

import { NextRequest } from 'next/server';
import { PATCH as patchApplication } from '@/app/api/employer/applications/[id]/route';
import { PATCH as patchApplicant } from '@/app/api/employer/jobs/[id]/applicants/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { notifyAndRecordPlacement } from '@/lib/employer/applicationStatusEffects';

const EMPLOYER_A = 'emp-a';
const EMPLOYER_B = 'emp-b';
const JOB_ID = 'job-1';
const APP_ID = 'app-1';

const findFirst = () => vi.mocked(prisma.jobPostingApplication.findFirst);
const updateMany = () => vi.mocked(prisma.jobPostingApplication.updateMany);
const update = () => vi.mocked(prisma.jobPostingApplication.update);
const effect = () => vi.mocked(notifyAndRecordPlacement);

function row(status: string, extra: Record<string, unknown> = {}) {
  return { id: APP_ID, jobId: JOB_ID, studentId: 'member-1', status, employerNotes: null, ...extra };
}

type Writer = {
  name: string;
  call: (body: Record<string, unknown>) => Promise<Response>;
  /** The CAS where-clause each writer must use for a read status of `from`. */
  casWhere: (from: string, employerId: string) => Record<string, unknown>;
};

const writers: Writer[] = [
  {
    name: 'PATCH /api/employer/applications/[id]',
    call: (body) =>
      patchApplication(
        new NextRequest(`http://localhost:3000/api/employer/applications/${APP_ID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: APP_ID }) },
      ),
    casWhere: (from, employerId) => ({ id: APP_ID, status: from, job: { employerId } }),
  },
  {
    name: 'PATCH /api/employer/jobs/[id]/applicants',
    call: (body) =>
      patchApplicant(
        new NextRequest(`http://localhost:3000/api/employer/jobs/${JOB_ID}/applicants?applicantId=${APP_ID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: JOB_ID }) },
      ),
    casWhere: (from) => ({ id: APP_ID, jobId: JOB_ID, status: from }),
  },
];

function signInAs(employerId: string) {
  vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
  vi.mocked(getEmployerForUser).mockResolvedValue({ employerId } as never);
  // The applicants route checks job ownership first; employer A owns job-1.
  vi.mocked(prisma.job.findFirst).mockImplementation((async (args: any) =>
    args?.where?.employerId === EMPLOYER_A ? { id: JOB_ID } : null) as never);
}

/** First findFirst is the ownership read; the second is the post-CAS re-read. */
function currentStatus(from: string, after: string = from) {
  findFirst().mockResolvedValueOnce(row(from) as never).mockResolvedValueOnce(row(after) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst().mockReset();
  updateMany().mockReset();
  signInAs(EMPLOYER_A);
});

describe.each(writers)('$name: transitions', (w) => {
  it('pending -> hired is refused with 409 invalid_transition; nothing written, no effect', async () => {
    currentStatus('pending');
    const res = await w.call({ status: 'hired' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('invalid_transition');
    expect(body.error).toBe("That move isn't available from New.");
    expect(body.allowed).toEqual(['reviewing', 'interview', 'rejected']);
    expect(updateMany()).not.toHaveBeenCalled();
    expect(update()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });

  it('hired -> pending is refused with 409 (hired is final here)', async () => {
    currentStatus('hired');
    const res = await w.call({ status: 'pending' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('invalid_transition');
    expect(body.allowed).toEqual([]);
    expect(updateMany()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });

  it('pending -> interview (the work-queue "Move to interview" button) succeeds; the effect runs exactly once', async () => {
    currentStatus('pending', 'interview');
    updateMany().mockResolvedValue({ count: 1 } as never);
    const res = await w.call({ status: 'interview' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.application.status).toBe('interview');
    expect(updateMany()).toHaveBeenCalledTimes(1);
    expect(updateMany().mock.calls[0][0]).toMatchObject({
      where: w.casWhere('pending', EMPLOYER_A),
      data: expect.objectContaining({ status: 'interview' }),
    });
    expect(effect()).toHaveBeenCalledTimes(1);
    expect(effect()).toHaveBeenCalledWith({
      applicationId: APP_ID,
      studentId: 'member-1',
      employerId: EMPLOYER_A,
      nextStatus: 'interview',
    });
  });

  it('reviewing -> interview succeeds', async () => {
    currentStatus('reviewing', 'interview');
    updateMany().mockResolvedValue({ count: 1 } as never);
    const res = await w.call({ status: 'interview' });
    expect(res.status).toBe(200);
    expect(updateMany().mock.calls[0][0].where).toEqual(w.casWhere('reviewing', EMPLOYER_A));
    expect(effect()).toHaveBeenCalledTimes(1);
  });

  it('a concurrent change (CAS count 0) returns 409 stale with no effect', async () => {
    currentStatus('reviewing');
    updateMany().mockResolvedValue({ count: 0 } as never);
    const res = await w.call({ status: 'interview' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('stale');
    expect(body.error).toBe('This application was updated by someone else. Reload to see the latest.');
    expect(effect()).not.toHaveBeenCalled();
  });

  it('never uses the unconditional update()', async () => {
    currentStatus('pending', 'reviewing');
    updateMany().mockResolvedValue({ count: 1 } as never);
    await w.call({ status: 'reviewing' });
    expect(update()).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/employer/applications/[id]: same-status saves', () => {
  it('a notes-only save (status unchanged) is allowed, keeps the CAS and runs no effect', async () => {
    currentStatus('interview');
    updateMany().mockResolvedValue({ count: 1 } as never);
    const res = await writers[0].call({ status: 'interview', employerNotes: 'Strong forklift experience.' });
    expect(res.status).toBe(200);
    expect(updateMany().mock.calls[0][0]).toMatchObject({
      where: { id: APP_ID, status: 'interview', job: { employerId: EMPLOYER_A } },
      data: expect.objectContaining({ employerNotes: 'Strong forklift experience.' }),
    });
    expect(effect()).not.toHaveBeenCalled();
  });

  it('a same-status save is allowed even from hired (no move, no effect)', async () => {
    currentStatus('hired');
    updateMany().mockResolvedValue({ count: 1 } as never);
    const res = await writers[0].call({ status: 'hired', employerNotes: 'Start date confirmed.' });
    expect(res.status).toBe(200);
    expect(effect()).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/employer/jobs/[id]/applicants: same-status saves', () => {
  it('re-sending the current status returns 200 with no effect', async () => {
    currentStatus('reviewing');
    updateMany().mockResolvedValue({ count: 1 } as never);
    const res = await writers[1].call({ status: 'reviewing' });
    expect(res.status).toBe(200);
    expect(effect()).not.toHaveBeenCalled();
  });
});

describe.each(writers)('$name: authz negatives', (w) => {
  it('no user -> 401, nothing read or written', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await w.call({ status: 'reviewing' });
    expect(res.status).toBe(401);
    expect(findFirst()).not.toHaveBeenCalled();
    expect(updateMany()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });

  it('no employer context -> 403, nothing read or written', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(null as never);
    const res = await w.call({ status: 'reviewing' });
    expect(res.status).toBe(403);
    expect(findFirst()).not.toHaveBeenCalled();
    expect(updateMany()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });

  it("employer B PATCHing employer A's application -> 404, no write, no effect", async () => {
    signInAs(EMPLOYER_B);
    // Under B's scope the application does not exist.
    findFirst().mockResolvedValue(null as never);
    const res = await w.call({ status: 'reviewing' });
    expect(res.status).toBe(404);
    expect(updateMany()).not.toHaveBeenCalled();
    expect(update()).not.toHaveBeenCalled();
    expect(effect()).not.toHaveBeenCalled();
  });
});

describe('ownership reads are scoped to the signed-in employer', () => {
  it('applications route reads the row under job.employerId', async () => {
    currentStatus('pending', 'reviewing');
    updateMany().mockResolvedValue({ count: 1 } as never);
    await writers[0].call({ status: 'reviewing' });
    for (const [args] of findFirst().mock.calls) {
      expect((args as any).where).toMatchObject({ id: APP_ID, job: { employerId: EMPLOYER_A } });
    }
  });

  it('applicants route checks the job under employerId, then reads the row under that job', async () => {
    currentStatus('pending', 'reviewing');
    updateMany().mockResolvedValue({ count: 1 } as never);
    await writers[1].call({ status: 'reviewing' });
    expect(vi.mocked(prisma.job.findFirst).mock.calls[0][0]).toMatchObject({ where: { id: JOB_ID, employerId: EMPLOYER_A } });
    for (const [args] of findFirst().mock.calls) {
      expect((args as any).where).toMatchObject({ id: APP_ID, jobId: JOB_ID });
    }
  });
});
