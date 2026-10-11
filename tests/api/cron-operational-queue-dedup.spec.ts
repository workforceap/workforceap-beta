import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: vi.fn() }, jobPostingApplication: { findMany: vi.fn() },
  notification: { findMany: vi.fn() }, emailSendLog: { findMany: vi.fn() },
} }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({
  sendOnboardingStallsDigestEmail: vi.fn(async () => ({ ok: true })),
  sendEmployerPendingApplicantsEmail: vi.fn(async () => ({ ok: true })),
  sendAdminStaleApplicantsDigestEmail: vi.fn(async () => ({ ok: true })),
  getAdminAlertRecipients: vi.fn(() => ['staff@example.org']),
}));
vi.mock('@/lib/email/send', () => ({ isFixtureEmailRecipient: (email: string) => email.endsWith('@example.com') }));
vi.mock('@/lib/cron/onboardingStallNudges', () => ({ sendMemberStallNudges: vi.fn(async () => ({ enabled: false })) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handler: unknown) => handler }));
vi.mock('@/lib/email/pacing', () => ({ createBulkEmailCronPacer: () => ({ run: <T>(operation: () => Promise<T>) => operation(), summary: () => ({}) }) }));

import { GET as onboarding } from '@/app/api/cron/onboarding-stalls/route';
import { GET as employerDigest } from '@/app/api/cron/employer-pending-applicants/route';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendOnboardingStallsDigestEmail, sendEmployerPendingApplicantsEmail, sendAdminStaleApplicantsDigestEmail } from '@/lib/email';
import { queueDigest, loadQueueDigestHistory } from '@/lib/cron/queueDigest';
import { employerPendingApplicantsHtml } from '@/emails/employer-pending-applicants';
import { onboardingStallsDigestHtml } from '@/emails/onboarding-stalls-digest';

const NOW = new Date('2026-10-11T12:00:00Z');
const OLD = new Date('2026-03-01T00:00:00Z');
const member = (id: string, organizationId = 'org-a') => ({ id, organizationId, fullName: 'Real Member', email: `${id}@example.org`, createdAt: OLD });
const admin = (id: string, organizationId: string, role = 'admin') => ({ id, organizationId, email: `${id}@example.org`, profile: { role }, userRoles: [] });
let noProgram = [member('member-a')];
let admins = [admin('admin-a', 'org-a')];
let applications: ReturnType<typeof application>[] = [];
const accepted = new Set<string>();
const persistedNotifications = new Map<string, string>();

function application(id: string, studentId = 'member-a', jobId = 'job-a') {
  return {
    id, studentId, jobId, status: 'pending', appliedAt: OLD, statusUpdatedAt: null as Date | null, lastEmployerMessageAt: null as Date | null,
    student: { organizationId: 'org-a' },
    job: { organizationId: 'org-a', employerId: 'employer-a', employer: {
      organizationId: 'org-a', userId: 'owner-a', companyName: 'Real Employer', contactEmail: 'owner@example.org',
      user: { organizationId: 'org-a', email: 'owner@example.org' },
    } },
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks();
  accepted.clear(); persistedNotifications.clear(); noProgram = [member('member-a')]; admins = [admin('admin-a', 'org-a')]; applications = [];
  vi.mocked(prisma.user.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) => {
    if ('interviewEligible' in args.where || 'wioaReviewStatus' in args.where) return [];
    if ('enrolledProgram' in args.where) return noProgram;
    return admins;
  }) as never);
  vi.mocked(prisma.jobPostingApplication.findMany).mockImplementation((async () => applications) as never);
  vi.mocked(prisma.emailSendLog.findMany).mockImplementation((async (args: { where: { entityId: { in: string[] }; status: string } }) =>
    args.where.status === 'sent' ? args.where.entityId.in.filter((key) => accepted.has(key)).map((entityId) => ({ entityId, providerMessageId: 'synthetic-acceptance' })) : []) as never);
  vi.mocked(prisma.notification.findMany).mockImplementation((async (args: { where: { OR: Array<{ userId: string; data: { equals: string } }> } }) =>
    args.where.OR.filter((filter) => persistedNotifications.get(filter.userId) === filter.data.equals).map(({ userId }) => ({ userId }))) as never);
  vi.mocked(createNotification).mockImplementation(async (input) => { persistedNotifications.set(input.userId, input.data?.queueDigestKey as string); });
  vi.mocked(sendOnboardingStallsDigestEmail).mockImplementation(async (params) => { accepted.add(params.entityId!); return { ok: true }; });
  vi.mocked(sendEmployerPendingApplicantsEmail).mockImplementation(async (params) => { accepted.add(params.entityId!); return { ok: true }; });
  vi.mocked(sendAdminStaleApplicantsDigestEmail).mockImplementation(async (params) => { accepted.add(params.entityId!); return { ok: true }; });
});
afterEach(() => { vi.useRealTimers(); });
const request = () => new Request('http://localhost/api/cron/test');

describe('same-day operational queue reminder history', () => {
  it('suppresses repeated onboarding notifications and accepted email, permits the next scheduled week', async () => {
    await onboarding(request());
    const repeated = await (await onboarding(request())).json();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(1);
    expect(repeated).toMatchObject({ digestsSkippedDuplicate: 1, notificationsSent: 0, emailSent: false });
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    await onboarding(request());
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(2);
  });

  it('retries failed mail despite a persisted notification, using the same provider key for unchanged payload', async () => {
    vi.mocked(sendOnboardingStallsDigestEmail).mockResolvedValueOnce({ ok: false, error: 'Network reset after possible acceptance' });
    expect((await onboarding(request())).status).toBe(500);
    await onboarding(request());
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[0][0].idempotencyKey)
      .toBe(vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[1][0].idempotencyKey);
  });

  it('retries skipped sends and changed queue membership, while resolved cases disappear', async () => {
    vi.mocked(sendOnboardingStallsDigestEmail).mockResolvedValueOnce({ ok: false, skipped: true, error: 'deadline' });
    await onboarding(request()); await onboarding(request());
    noProgram = [member('replacement-member')]; await onboarding(request());
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(sendOnboardingStallsDigestEmail).mock.calls;
    expect(calls[1][0].entityId).not.toBe(calls[2][0].entityId);
    noProgram = []; expect((await (await onboarding(request())).json()).totalStalled).toBe(0);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(3);
  });

  it('does not send when accepted-send history is unavailable', async () => {
    vi.mocked(prisma.emailSendLog.findMany).mockRejectedValueOnce(new Error('History unavailable'));
    await expect(onboarding(request())).rejects.toThrow('History unavailable');
    expect(createNotification).not.toHaveBeenCalled(); expect(sendOnboardingStallsDigestEmail).not.toHaveBeenCalled();
  });

  it('keeps each org admin payload in its own org and grants global digest only to platform super admins', async () => {
    noProgram = [member('member-a', 'org-a'), member('member-b', 'org-b')];
    admins = [admin('admin-a', 'org-a'), admin('admin-b', 'org-b'), admin('super', 'org-a', 'super_admin')];
    await onboarding(request());
    const calls = vi.mocked(sendOnboardingStallsDigestEmail).mock.calls.map(([params]) => params);
    expect(calls.find((params) => params.to[0] === 'admin-a@example.org')?.noProgramMembers.map((row) => row.id)).toEqual(['member-a']);
    expect(calls.find((params) => params.to[0] === 'admin-b@example.org')?.noProgramMembers.map((row) => row.id)).toEqual(['member-b']);
    expect(calls.find((params) => params.to[0] === 'super@example.org')?.noProgramCount).toBe(2);
  });

  it('continues email and later recipients after one notification rejection, then retries only that notification', async () => {
    admins = [admin('admin-a', 'org-a'), admin('admin-second', 'org-a')];
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('Request registration failed'));
    const response = await onboarding(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ notificationsFailed: 1, notificationsSent: 1, digestEmailsSent: 2 });
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(2);
    await onboarding(request());
    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(2);
  });

  it('uses current role precedence rather than a stale admin profile to disclose the queue', async () => {
    admins = [{ ...admin('demoted', 'org-a'), userRoles: [{ role: { name: 'employer' } }] }] as never;
    await onboarding(request());
    expect(sendOnboardingStallsDigestEmail).not.toHaveBeenCalled(); expect(createNotification).not.toHaveBeenCalled();
  });

  it('counts scan truncation without leaking private names, emails or IDs in cron results', async () => {
    noProgram = Array.from({ length: 501 }, (_, index) => member(`private-${index}`));
    const result = await (await onboarding(request())).json();
    expect(result).toMatchObject({ noProgramStalled: 500, queueTruncated: { noProgram: true } });
    expect(JSON.stringify(result)).not.toContain('private-'); expect(JSON.stringify(result)).not.toContain('@example.org');
    const params = vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[0][0];
    expect(onboardingStallsDigestHtml(params)).toContain('Queue scan capped');
  });
});

describe('employer pending-applicant reminders', () => {
  it('counts the same applicant once across jobs and dedups accepted employer notifications/email', async () => {
    applications = [application('a-1'), application('a-2', 'member-a', 'job-b')];
    await employerDigest(request()); const repeated = await (await employerDigest(request())).json();
    expect(sendEmployerPendingApplicantsEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmployerPendingApplicantsEmail).mock.calls[0][0]).toMatchObject({ candidateCount: 1, jobsAffected: 2 });
    expect(repeated).toMatchObject({ staleApplications: 2, employersNotified: 0, emailsSkippedDuplicate: 1 });
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('retries failed employer email independently of notification success', async () => {
    applications = [application('a-1')];
    vi.mocked(sendEmployerPendingApplicantsEmail).mockResolvedValueOnce({ ok: false, error: 'Provider unavailable' });
    expect((await employerDigest(request())).status).toBe(500);
    await employerDigest(request());
    expect(createNotification).toHaveBeenCalledTimes(1); expect(sendEmployerPendingApplicantsEmail).toHaveBeenCalledTimes(2);
  });

  it('continues employer emails and later owners after a notification rejection', async () => {
    const second = application('a-2'); second.job.employerId = 'employer-second';
    second.job.employer.userId = 'owner-second'; second.job.employer.contactEmail = 'owner-second@example.org';
    applications = [application('a-1'), second];
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('Request registration failed'));
    const response = await employerDigest(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ notificationsFailed: 1, employersNotified: 1, employerEmailsSent: 2 });
    await employerDigest(request());
    expect(createNotification).toHaveBeenCalledTimes(3); expect(sendEmployerPendingApplicantsEmail).toHaveBeenCalledTimes(2);
  });

  it('drops organization mismatches and explicit fixture owners with count-only diagnostics', async () => {
    const wrongOrg = application('private-wrong-org'); wrongOrg.student.organizationId = 'org-b';
    const fixture = application('private-fixture'); fixture.job.employer.user.email = 'employer@example.com';
    applications = [wrongOrg, fixture];
    const result = await (await employerDigest(request())).json();
    expect(result).toMatchObject({ excludedOrganizationMismatch: 1, excludedFixtureEmployer: 1, staleApplications: 0 });
    expect(sendEmployerPendingApplicantsEmail).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('reports response wait from the most recent employer action and labels it precisely', async () => {
    const row = application('a-1'); row.statusUpdatedAt = new Date('2026-10-01T12:00:00Z');
    row.lastEmployerMessageAt = new Date('2026-10-04T12:00:00Z'); applications = [row];
    await employerDigest(request());
    const params = vi.mocked(sendEmployerPendingApplicantsEmail).mock.calls[0][0];
    expect(params.oldestWaitingDays).toBe(7);
    expect(employerPendingApplicantsHtml(params)).toContain('recorded employer response');
    expect(employerPendingApplicantsHtml(params)).not.toContain('sitting for');
  });

  it('marks oldest effective response wait unknown when an older wait lies outside the capped applied-date scan', async () => {
    applications = Array.from({ length: 500 }, (_, index) => ({ ...application(`a-${index}`, `member-${index}`),
      statusUpdatedAt: new Date('2026-10-05T12:00:00Z') }));
    applications.push({ ...application('hidden-oldest'), appliedAt: new Date('2026-09-01T12:00:00Z') });
    const result = await (await employerDigest(request())).json();
    expect(result).toMatchObject({ queueTruncated: true, staleApplications: 500,
      oldestEmployerResponseDays: null, oldestScannedEmployerResponseDays: 6 });
    const params = vi.mocked(sendEmployerPendingApplicantsEmail).mock.calls[0][0];
    expect(employerPendingApplicantsHtml(params)).toContain('The longest observed wait in this scan');
    expect(employerPendingApplicantsHtml(params)).not.toContain('The longest wait since');
    expect(vi.mocked(createNotification).mock.calls[0][0].body).toContain('The longest observed wait in this scan is 6 days');
  });

  it('preserves the heavy-backlog staff alert and retries only its failed acceptance', async () => {
    applications = Array.from({ length: 10 }, (_, index) => application(`a-${index}`, `member-${index}`));
    vi.mocked(sendAdminStaleApplicantsDigestEmail).mockResolvedValueOnce({ ok: false, error: 'Provider unavailable' });
    expect((await employerDigest(request())).status).toBe(500);
    await employerDigest(request()); await employerDigest(request());
    expect(sendEmployerPendingApplicantsEmail).toHaveBeenCalledTimes(1);
    expect(sendAdminStaleApplicantsDigestEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendAdminStaleApplicantsDigestEmail).mock.calls[1][0].employers).toEqual([{ companyName: 'Real Employer', candidateCount: 10 }]);
  });
});

describe('digest key semantics', () => {
  it('normalizes recipient order, retains state identity across display aging, scopes tenants and rotates UTC days', async () => {
    const input = { workflow: 'staff_queue', scope: 'org-a', recipients: [' b@example.org ', 'A@example.org'], state: ['member-a'], payload: { age: 10 } };
    const first = queueDigest(input, NOW);
    const aged = queueDigest({ ...input, recipients: ['a@example.org', 'b@example.org'], payload: { age: 11 } }, NOW);
    expect(first.key).toBe(aged.key); expect(first.idempotencyKey).not.toBe(aged.idempotencyKey);
    expect(queueDigest({ ...input, scope: 'org-b' }, NOW).key).not.toBe(first.key);
    expect(queueDigest(input, new Date('2026-10-12T00:00:00Z')).key).not.toBe(first.key);
    expect(first.key).not.toContain('member-a'); expect(first.key).not.toContain('example.org');
    await expect(loadQueueDigestHistory([])).resolves.toEqual({ emailed: new Set(), notified: new Set() });
  });
});
