import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      }),
    redirect: (url: string | URL, status = 307) =>
      new Response(null, {
        status,
        headers: { location: String(url) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    job: { findFirst: vi.fn(), update: vi.fn() },
    jobPostingApplication: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendNewJobApplicationEmail: vi.fn(),
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/jobs/syncCuratedJobToTracker', () => ({
  syncCuratedJobToTracker: vi.fn(),
}));

vi.mock('@/lib/member/points', () => ({
  awardPoints: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

import { POST as applyForJob } from '@/app/api/(portal)/dashboard/jobs/[id]/apply/route';
import { GET as getEmployerApplicationResume } from '@/app/api/employer/applications/[id]/resume/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendNewJobApplicationEmail } from '@/lib/email';
import { trackEvent } from '@/lib/events/track';
import { syncCuratedJobToTracker } from '@/lib/jobs/syncCuratedJobToTracker';
import { awardPoints } from '@/lib/member/points';

const MEMBER_ID = 'member-123';
const JOB_ID = 'job-123';

function makeApplyRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/dashboard/jobs/${JOB_ID}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function applyContext() {
  return { params: Promise.resolve({ id: JOB_ID }) };
}

function employerContext(applicationId = 'application-123') {
  return { params: Promise.resolve({ id: applicationId }) };
}

function makeStorage() {
  return {
    copy: vi.fn().mockResolvedValue({ data: {}, error: null }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed-resume' },
      error: null,
    }),
  };
}

describe('job application resume snapshots', () => {
  let storage: ReturnType<typeof makeStorage>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    storage = makeStorage();
    from = vi.fn(() => storage);
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from } } as never);

    vi.mocked(getUser).mockResolvedValue({ id: MEMBER_ID } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      fullName: 'Taylor Member',
      email: 'taylor@example.com',
    } as never);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      resumeOriginalPath: `${MEMBER_ID}/resume-original-v1.pdf`,
      resumeEnhancedPath: `${MEMBER_ID}/resume-enhanced-v2.pdf`,
    } as never);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({
      id: JOB_ID,
      title: 'Support Specialist',
      employer: {
        contactEmail: 'employer@example.com',
        companyName: 'Example Employer',
      },
    } as never);
    vi.mocked(prisma.jobPostingApplication.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.jobPostingApplication.create).mockImplementation((async (
      args: { data: { id: string } },
    ) => ({ id: args.data.id })) as never);
    vi.mocked(prisma.job.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation((async (
      callback: (tx: typeof prisma) => Promise<unknown>,
    ) => callback(prisma)) as never);

    vi.mocked(sendNewJobApplicationEmail).mockResolvedValue(undefined as never);
    vi.mocked(trackEvent).mockResolvedValue(undefined as never);
    vi.mocked(syncCuratedJobToTracker).mockResolvedValue(undefined as never);
    vi.mocked(awardPoints).mockResolvedValue(undefined as never);
  });

  it('does not copy or persist a resume snapshot without share-resume consent', async () => {
    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: false }),
      applyContext(),
    );

    expect(response.status).toBe(200);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(storage.copy).not.toHaveBeenCalled();
    expect(prisma.jobPostingApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: JOB_ID,
          studentId: MEMBER_ID,
          resumePath: undefined,
        }),
      }),
    );
  });

  it('copies the selected owned resume to an immutable application path before the transaction', async () => {
    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: true }),
      applyContext(),
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('member-resumes');
    expect(storage.copy).toHaveBeenCalledOnce();

    const [sourcePath, snapshotPath] = vi.mocked(storage.copy).mock.calls[0];
    expect(sourcePath).toBe(`${MEMBER_ID}/resume-enhanced-v2.pdf`);
    expect(snapshotPath).toMatch(
      new RegExp(`^${MEMBER_ID}/application-[0-9a-f-]+-resume\\.pdf$`, 'i'),
    );
    expect(prisma.jobPostingApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resumePath: snapshotPath }),
      }),
    );
    expect(storage.copy.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.$transaction).mock.invocationCallOrder[0],
    );
  });

  it('does not create an application when the resume snapshot copy fails', async () => {
    storage.copy.mockResolvedValueOnce({ data: null, error: { message: 'copy failed' } });

    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: true }),
      applyContext(),
    );

    expect(response.status).toBe(503);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.jobPostingApplication.create).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('removes the copied snapshot when the database transaction fails', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('transaction failed'));

    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: true }),
      applyContext(),
    );

    expect(response.status).toBe(500);
    const snapshotPath = vi.mocked(storage.copy).mock.calls[0][1];
    expect(storage.remove).toHaveBeenCalledWith([snapshotPath]);
    expect(sendNewJobApplicationEmail).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('retains the snapshot and continues when a committed row proves acknowledgement was lost', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('commit acknowledgement lost'));
    vi.mocked(prisma.jobPostingApplication.findFirst).mockImplementationOnce((async (
      args: { where: { id: string; resumePath: string } },
    ) => ({ id: args.where.id })) as never);

    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: true }),
      applyContext(),
    );
    const result = await response.json() as { applicationId: string };

    expect(response.status).toBe(200);
    expect(result.applicationId).toMatch(/^[0-9a-f-]+$/i);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(sendNewJobApplicationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: result.applicationId }),
    );
  });

  it('retains the bounded snapshot when commit verification is unavailable', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('commit acknowledgement lost'));
    vi.mocked(prisma.jobPostingApplication.findFirst).mockRejectedValueOnce(
      new Error('verification unavailable'),
    );

    const response = await applyForJob(
      makeApplyRequest({ shareProfile: true, shareResume: true }),
      applyContext(),
    );

    expect(response.status).toBe(503);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(sendNewJobApplicationEmail).not.toHaveBeenCalled();
  });
});

describe('employer application resume access', () => {
  let storage: ReturnType<typeof makeStorage>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    storage = makeStorage();
    from = vi.fn(() => storage);
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from } } as never);

    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'employer-1' } as never);
    vi.mocked(prisma.jobPostingApplication.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it('scopes the lookup to the signed-in employer organization and signs the stored application snapshot', async () => {
    const applicationId = 'application-123';
    const snapshotPath = `${MEMBER_ID}/application-${applicationId}-resume.pdf`;
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: snapshotPath,
    } as never);

    const response = await getEmployerApplicationResume(
      new Request(`http://localhost/api/employer/applications/${applicationId}/resume`),
      employerContext(applicationId),
    );

    expect(prisma.jobPostingApplication.findFirst).toHaveBeenCalledWith({
      where: { id: applicationId, job: { employerId: 'employer-1' } },
      select: { studentId: true, resumePath: true },
    });
    expect(from).toHaveBeenCalledWith('member-resumes');
    expect(storage.createSignedUrl).toHaveBeenCalledWith(snapshotPath, 300);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed-resume');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('copies an exact legacy shared key to the application snapshot and conditionally updates the row', async () => {
    const applicationId = 'application-legacy';
    const legacyPath = `${MEMBER_ID}/resume-original.pdf`;
    const snapshotPath = `${MEMBER_ID}/application-${applicationId}-resume.pdf`;
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: legacyPath,
    } as never);
    storage.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://storage.example/migrated-resume' },
      error: null,
    });

    const response = await getEmployerApplicationResume(
      new Request(`http://localhost/api/employer/applications/${applicationId}/resume`),
      employerContext(applicationId),
    );

    expect(storage.copy).toHaveBeenCalledWith(legacyPath, snapshotPath);
    expect(prisma.jobPostingApplication.updateMany).toHaveBeenCalledWith({
      where: { id: applicationId, studentId: MEMBER_ID, resumePath: legacyPath },
      data: { resumePath: snapshotPath },
    });
    expect(storage.createSignedUrl).toHaveBeenLastCalledWith(snapshotPath, 300);
    expect(response.status).toBe(307);
  });

  it('leaves the legacy row untouched when snapshot copy fails', async () => {
    const applicationId = 'application-copy-failure';
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: `${MEMBER_ID}/resume-enhanced.txt`,
    } as never);
    storage.copy.mockResolvedValueOnce({ data: null, error: { message: 'copy failed' } });

    const response = await getEmployerApplicationResume(
      new Request(`http://localhost/api/employer/applications/${applicationId}/resume`),
      employerContext(applicationId),
    );

    expect(response.status).toBe(502);
    expect(prisma.jobPostingApplication.updateMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('keeps a bounded deterministic snapshot if the legacy row cannot be updated', async () => {
    const applicationId = 'application-persist-failure';
    const legacyPath = `${MEMBER_ID}/resume-original.docx`;
    const snapshotPath = `${MEMBER_ID}/application-${applicationId}-resume.docx`;
    vi.mocked(prisma.jobPostingApplication.findFirst)
      .mockResolvedValueOnce({ studentId: MEMBER_ID, resumePath: legacyPath } as never)
      .mockResolvedValueOnce({ studentId: MEMBER_ID, resumePath: legacyPath } as never);
    vi.mocked(prisma.jobPostingApplication.updateMany).mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    const response = await getEmployerApplicationResume(
      new Request(`http://localhost/api/employer/applications/${applicationId}/resume`),
      employerContext(applicationId),
    );

    expect(response.status).toBe(502);
    expect(storage.copy).toHaveBeenCalledWith(legacyPath, snapshotPath);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('repairs the row from a pre-existing deterministic snapshot without recopying', async () => {
    const applicationId = 'application-repair';
    const legacyPath = `${MEMBER_ID}/resume-enhanced.txt`;
    const snapshotPath = `${MEMBER_ID}/application-${applicationId}-resume.txt`;
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: legacyPath,
    } as never);
    storage.copy.mockResolvedValueOnce({
      data: null,
      error: { statusCode: '409', message: 'The resource already exists' },
    });

    const response = await getEmployerApplicationResume(
      new Request(`http://localhost/api/employer/applications/${applicationId}/resume`),
      employerContext(applicationId),
    );

    expect(storage.copy).toHaveBeenCalledWith(legacyPath, snapshotPath);
    expect(prisma.jobPostingApplication.updateMany).toHaveBeenCalledWith({
      where: { id: applicationId, studentId: MEMBER_ID, resumePath: legacyPath },
      data: { resumePath: snapshotPath },
    });
    expect(response.status).toBe(307);
  });

  it('does not sign a resume when the application is outside the employer organization', async () => {
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue(null);

    const response = await getEmployerApplicationResume(
      new Request('http://localhost/api/employer/applications/application-elsewhere/resume'),
      employerContext('application-elsewhere'),
    );

    expect(response.status).toBe(404);
    expect(prisma.jobPostingApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'application-elsewhere',
          job: { employerId: 'employer-1' },
        },
      }),
    );
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects an owned live profile object instead of signing it as an application snapshot', async () => {
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: `${MEMBER_ID}/resume-original-v1.pdf`,
    } as never);

    const response = await getEmployerApplicationResume(
      new Request('http://localhost/api/employer/applications/application-123/resume'),
      employerContext('application-123'),
    );

    expect(response.status).toBe(409);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a snapshot created for a different application', async () => {
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      studentId: MEMBER_ID,
      resumePath: `${MEMBER_ID}/application-application-other-resume.pdf`,
    } as never);

    const response = await getEmployerApplicationResume(
      new Request('http://localhost/api/employer/applications/application-123/resume'),
      employerContext('application-123'),
    );

    expect(response.status).toBe(409);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
