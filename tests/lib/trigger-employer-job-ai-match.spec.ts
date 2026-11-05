import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/diagnostics', () => ({
  recordWorkflowDiagnostic: vi.fn(async () => undefined),
}));

vi.mock('@/lib/admin/adminJobMatchesPrismaDeps', () => ({
  createAdminJobMatchesPrismaDeps: vi.fn(),
}));

vi.mock('@/lib/admin/runAdminJobMatchesGet', () => ({
  runAdminJobMatchesGet: vi.fn(),
}));

const { runAiMatchForLiveJob } = await import('@/lib/employer/triggerEmployerJobAiMatch');
const { createAdminJobMatchesPrismaDeps } = await import('@/lib/admin/adminJobMatchesPrismaDeps');
const { runAdminJobMatchesGet } = await import('@/lib/admin/runAdminJobMatchesGet');
const { recordWorkflowDiagnostic } = await import('@/lib/diagnostics');

const job = {
  id: 'job-1',
  title: 'IT Support Specialist',
  requirements: [],
  suggestedPrograms: [],
  preferredCertifications: [],
};

describe('runAiMatchForLiveJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not compute matches when the proved organization cannot see the job', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const findAuthorizedJob = vi.fn().mockResolvedValue(null);
    vi.mocked(createAdminJobMatchesPrismaDeps).mockReturnValue({ findAuthorizedJob } as never);

    await runAiMatchForLiveJob('job-1', 'org-a');

    expect(createAdminJobMatchesPrismaDeps).toHaveBeenCalledWith('org-a', expect.any(Function));
    expect(findAuthorizedJob).toHaveBeenCalledWith('job-1');
    expect(runAdminJobMatchesGet).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[employer_match_auto] jobId=job-1 error=job not found in organization',
    );
    consoleError.mockRestore();
  });

  it('runs tenant-scoped matching and records the auto-match diagnostic workflow', async () => {
    const findAuthorizedJob = vi.fn().mockResolvedValue(job);
    vi.mocked(createAdminJobMatchesPrismaDeps).mockReturnValue({ findAuthorizedJob } as never);
    vi.mocked(runAdminJobMatchesGet).mockResolvedValue({
      status: 200,
      body: [{ studentId: 'm1' }, { studentId: 'm2' }],
    });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runAiMatchForLiveJob('job-1', 'org-a');

    expect(runAdminJobMatchesGet).toHaveBeenCalledWith('job-1', job, expect.objectContaining({
      findAuthorizedJob,
    }));
    expect(consoleLog).toHaveBeenCalledWith('[employer_match_auto] jobId=job-1 triggered matches=2');

    const diagnostic = vi.mocked(createAdminJobMatchesPrismaDeps).mock.calls[0][1];
    await diagnostic({
      status: 'success',
      summary: 'computed',
      method: 'compute',
      fallbackPath: null,
      metadata: { count: 2 },
    });
    expect(recordWorkflowDiagnostic).toHaveBeenCalledWith({
      workflow: 'employer_job_live_auto_match',
      actorUserId: null,
      entityType: 'job',
      entityId: 'job-1',
      status: 'success',
      summary: 'computed',
      method: 'compute',
      fallbackPath: null,
      metadata: { count: 2, jobId: 'job-1' },
    });
    consoleLog.mockRestore();
  });

  it('swallows a compute throw so post-commit approval cannot fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createAdminJobMatchesPrismaDeps).mockReturnValue({
      findAuthorizedJob: vi.fn().mockResolvedValue(job),
    } as never);
    vi.mocked(runAdminJobMatchesGet).mockRejectedValueOnce(new Error('match store down'));

    await expect(runAiMatchForLiveJob('job-1', 'org-a')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('[employer_match_auto] jobId=job-1 error=match store down');
    consoleError.mockRestore();
  });
});
