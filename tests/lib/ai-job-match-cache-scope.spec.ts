import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/matchStudents', () => ({ matchStudentsForJob: vi.fn() }));
const { matchStudentsForJob } = await import('@/lib/ai/matchStudents');
const {
  getOrComputeAiJobMatches,
  markAiJobMatchEmptyCooldown,
  clearAiJobMatchEmptyCooldown,
} = await import('@/lib/admin/aiJobMatchCompute');

const job = { requirements: [], suggestedPrograms: [], preferredCertifications: [] };

describe('AI job-match computation cache tenant scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not share a same-job promise across organizations', async () => {
    let releaseA!: () => void;
    vi.mocked(matchStudentsForJob)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseA = () => resolve([]); }))
      .mockResolvedValueOnce([]);

    const orgA = getOrComputeAiJobMatches('job-1', 'org-a', job);
    const orgB = getOrComputeAiJobMatches('job-1', 'org-b', job);
    expect(matchStudentsForJob).toHaveBeenCalledTimes(2);
    expect(matchStudentsForJob).toHaveBeenNthCalledWith(1, 'org-a', job);
    expect(matchStudentsForJob).toHaveBeenNthCalledWith(2, 'org-b', job);
    releaseA();
    await Promise.all([orgA, orgB]);
  });

  it('does not apply one organization empty cooldown to another', async () => {
    vi.mocked(matchStudentsForJob).mockResolvedValue([]);
    markAiJobMatchEmptyCooldown('job-1', 'org-a');

    await getOrComputeAiJobMatches('job-1', 'org-a', job);
    await getOrComputeAiJobMatches('job-1', 'org-b', job);

    expect(matchStudentsForJob).toHaveBeenCalledTimes(1);
    expect(matchStudentsForJob).toHaveBeenCalledWith('org-b', job);
    clearAiJobMatchEmptyCooldown('job-1', 'org-a');
  });

  it('reuses one in-flight promise for the same organization and job', async () => {
    let release!: () => void;
    vi.mocked(matchStudentsForJob).mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([{ studentId: 'member-a' }] as never); }),
    );

    const first = getOrComputeAiJobMatches('job-1', 'org-a', job);
    const second = getOrComputeAiJobMatches('job-1', 'org-a', job);
    expect(matchStudentsForJob).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ studentId: 'member-a' }],
      [{ studentId: 'member-a' }],
    ]);
  });

  it('softens a compute throw to an empty list so the handler can still answer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(matchStudentsForJob).mockRejectedValueOnce(new Error('model unavailable'));

    await expect(getOrComputeAiJobMatches('job-1', 'org-a', job)).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();

    vi.mocked(matchStudentsForJob).mockResolvedValueOnce([{ studentId: 'member-b' }] as never);
    await expect(getOrComputeAiJobMatches('job-1', 'org-a', job)).resolves.toEqual([{ studentId: 'member-b' }]);
    expect(matchStudentsForJob).toHaveBeenCalledTimes(2);
  });
});

