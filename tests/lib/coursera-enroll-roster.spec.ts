// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/coursera/b4bClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/coursera/b4bClient')>()),
  listUsers: vi.fn(), inviteUserToProgram: vi.fn(), createProgramMembership: vi.fn(), enrollUserInCourse: vi.fn(),
}));
import { B4BConfigurationError, listUsers, inviteUserToProgram, createProgramMembership, enrollUserInCourse } from '@/lib/coursera/b4bClient';
import { buildB4BPort, CourseraRosterIncompleteError, _resetRosterLookupCacheForTesting } from '@/lib/coursera/enrollPort';
import { runEnrollStateMachine } from '@/lib/coursera/enrollState';

const target = 'learner@example.test';
const fullPage = Array.from({ length: 200 }, (_, i) => ({ email: `fixture-${i}@example.test` }));
const input = { orgId: 'org-1', programId: 'program-1', courseraCourseId: 'course-1', externalId: target, email: target, fullName: 'Fixture Learner' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('COURSERA_ORG_ID', 'org-1');
  _resetRosterLookupCacheForTesting();
});
afterEach(() => vi.unstubAllEnvs());
const noWrites = () => {
  expect(inviteUserToProgram).not.toHaveBeenCalled();
  expect(createProgramMembership).not.toHaveBeenCalled();
  expect(enrollUserInCourse).not.toHaveBeenCalled();
};

describe('enrollment roster lookup coverage', () => {
  it.each([undefined, 20_000])('exhausted roster with total %s never invites or caches an absent learner', async (total) => {
    vi.mocked(listUsers).mockResolvedValue({ elements: fullPage, paging: { total } });
    const port = buildB4BPort();
    await expect(runEnrollStateMachine(port, input)).rejects.toMatchObject({
      name: 'CourseraRosterIncompleteError', code: 'COURSERA_ROSTER_INCOMPLETE', reason: 'page_limit',
    });
    expect(listUsers).toHaveBeenCalledTimes(50);
    noWrites();
    // A later retry must perform a fresh lookup, not consume a negative cache.
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [{ email: target }], paging: {} });
    expect(await port.listUsersByEmail(target)).toEqual({ email: target });
    expect(listUsers).toHaveBeenCalledTimes(51);
  });

  it.each([
    { elements: [], paging: {} },
    { elements: [{ email: 'other@example.test' }], paging: {} },
    { elements: fullPage, paging: { total: 200 } },
  ])('accepts only a completed not-found lookup and caches it', async (page) => {
    vi.mocked(listUsers).mockResolvedValueOnce(page);
    const port = buildB4BPort();
    expect(await port.listUsersByEmail(target)).toBeNull();
    expect(await port.listUsersByEmail(target)).toBeNull();
    expect(listUsers).toHaveBeenCalledOnce();
  });

  it('permits a confirmed not-found invite using the configured provider organization', async () => {
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [], paging: {} });
    vi.mocked(inviteUserToProgram).mockResolvedValueOnce({ ok: true, status: 201, data: {} });
    expect((await runEnrollStateMachine(buildB4BPort(), input)).status).toBe('invited');
    expect(inviteUserToProgram).toHaveBeenCalledWith('org-1', 'program-1', expect.objectContaining({ email: target }));
  });

  it('can prove not-found at the end of the fiftieth full page', async () => {
    vi.mocked(listUsers).mockResolvedValue({ elements: fullPage, paging: { total: 10_000 } });
    expect(await buildB4BPort().listUsersByEmail(target)).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(50);
  });

  it('honors continuation on a short page and finds the learner on the next page', async () => {
    const hit = { email: ' LEARNER@example.test ', membershipProgramIds: ['program-1'] };
    vi.mocked(listUsers)
      .mockResolvedValueOnce({ elements: [{ email: 'other@example.test' }], paging: { next: 300 } })
      .mockResolvedValueOnce({ elements: [hit], paging: {} });
    expect(await buildB4BPort().listUsersByEmail(target)).toBe(hit);
    expect(listUsers).toHaveBeenNthCalledWith(2, { start: 300, limit: 200 });
  });

  it('keeps reading a short page when the reported total has not been reached', async () => {
    vi.mocked(listUsers)
      .mockResolvedValueOnce({ elements: [{ email: 'other@example.test' }], paging: { total: 2 } })
      .mockResolvedValueOnce({ elements: [{ email: target }], paging: { total: 2 } });
    expect(await buildB4BPort().listUsersByEmail(target)).toEqual({ email: target });
    expect(listUsers).toHaveBeenNthCalledWith(2, { start: 1, limit: 200 });
  });

  it.each([
    { elements: fullPage, paging: { next: 0 } },
    { elements: [], paging: { total: 10 } },
  ])('fails closed on contradictory pagination', async (page) => {
    vi.mocked(listUsers).mockResolvedValueOnce(page);
    await expect(runEnrollStateMachine(buildB4BPort(), input)).rejects.toBeInstanceOf(CourseraRosterIncompleteError);
    noWrites();
  });

  it('does not cache a failed provider request', async () => {
    const port = buildB4BPort();
    vi.mocked(listUsers).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(port.listUsersByEmail(target)).rejects.toThrow('provider unavailable');
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [{ email: target }], paging: {} });
    expect(await port.listUsersByEmail(target)).toEqual({ email: target });
  });

  it('isolates both positive and negative cache entries by provider organization', async () => {
    const port = buildB4BPort();
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [], paging: {} });
    expect(await port.listUsersByEmail(target)).toBeNull();
    vi.stubEnv('COURSERA_ORG_ID', 'org-2');
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [{ id: 'org-2-user', email: target }], paging: {} });
    expect(await port.listUsersByEmail(target)).toMatchObject({ id: 'org-2-user' });
    expect(await port.listUsersByEmail(target)).toMatchObject({ id: 'org-2-user' });
    vi.stubEnv('COURSERA_ORG_ID', 'org-1');
    expect(await port.listUsersByEmail(target)).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('does not use an earlier cache when organization configuration is missing', async () => {
    const port = buildB4BPort();
    vi.mocked(listUsers).mockResolvedValueOnce({ elements: [], paging: {} });
    await port.listUsersByEmail(target);
    vi.stubEnv('COURSERA_ORG_ID', ' ');
    await expect(runEnrollStateMachine(port, input)).rejects.toBeInstanceOf(B4BConfigurationError);
    expect(listUsers).toHaveBeenCalledOnce();
    noWrites();
  });

  it('rejects a configuration change during the scan before caching or inviting', async () => {
    vi.mocked(listUsers).mockImplementationOnce(async () => {
      vi.stubEnv('COURSERA_ORG_ID', 'org-2');
      return { elements: [], paging: {} };
    });
    await expect(runEnrollStateMachine(buildB4BPort(), input)).rejects.toMatchObject({ reason: 'configuration_changed' });
    noWrites();
  });
});
