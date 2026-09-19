import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { courseEnrollment: { findMany: vi.fn() }, memberEvent: { findMany: vi.fn(), create: vi.fn() } } }));
vi.mock('@/lib/email', () => ({ sendCourseAccountabilityEmail: vi.fn() }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handler: unknown) => handler }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: () => ({ title: 'IT Support' }), getProgramDisplayTitle: () => 'IT Support' }));
vi.mock('@/lib/cron/nudgeThrottle', () => ({ filterNudgeEligibleUserIds: vi.fn(), recordNudgeSent: vi.fn() }));
import { GET } from '@/app/api/cron/course-accountability/route';
import { prisma } from '@/lib/db/prisma';
import { sendCourseAccountabilityEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications/create';
import { filterNudgeEligibleUserIds, recordNudgeSent } from '@/lib/cron/nudgeThrottle';

const candidate = (id: string) => ({ id, userId: id, programSlug: 'it-support', isPrimary: true, fundingSource: null, user: { email: `${id}@example.org`, fullName: 'Jordan Example', deletedAt: null, courseraEnrollmentApproved: false } });
const request = () => new Request('http://localhost/api/cron/course-accountability');
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([]);
  vi.mocked(prisma.memberEvent.create).mockResolvedValue({} as never);
  vi.mocked(sendCourseAccountabilityEmail).mockResolvedValue({ ok: true });
  vi.mocked(filterNudgeEligibleUserIds).mockImplementation(async (ids) => new Set(ids));
  vi.mocked(createNotification).mockResolvedValue(undefined as never);
  vi.mocked(recordNudgeSent).mockResolvedValue(undefined);
});

describe('reserved-seat funding-update cron', () => {
  it('selects pending primary assignments and skips approved, funded, secondary and unknown flags before dispatch', async () => {
    const eligible = candidate('eligible');
    const approved = candidate('approved'); approved.user.courseraEnrollmentApproved = true;
    const funded = { ...candidate('funded'), fundingSource: 'GRANT' };
    const secondary = { ...candidate('secondary'), isPrimary: false };
    const unknown = { ...candidate('unknown'), user: { ...candidate('unknown').user, courseraEnrollmentApproved: undefined } };
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([eligible, approved, funded, secondary, unknown] as never);
    const result = await GET(request());
    expect(await result.json()).toMatchObject({ sent: 1, counselorFollowups: 1 });
    expect(prisma.courseEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isPrimary: true, fundingSource: null, user: { deletedAt: null, courseraEnrollmentApproved: false } }) }));
    expect(sendCourseAccountabilityEmail).toHaveBeenCalledExactlyOnceWith({ to: 'eligible@example.org', fullName: 'Jordan Example', programName: 'IT Support' });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Your IT Support training seat is reserved', data: { link: '/dashboard/program' } }));
    expect(JSON.stringify(vi.mocked(createNotification).mock.calls)).not.toMatch(/haven't started|pick up where|Ready to start/);
    expect(prisma.memberEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventName: 'counselor_followup_needed', metadata: expect.objectContaining({ reason: 'funding_enrollment_followup' }) }) }));
  });

  it('preserves enrollment idempotency and the shared outreach cooldown', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([candidate('sent'), candidate('cooldown')] as never);
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([{ entityId: 'sent' }] as never);
    vi.mocked(filterNudgeEligibleUserIds).mockResolvedValue(new Set(['sent']));
    expect(await (await GET(request())).json()).toMatchObject({ sent: 0 });
    expect(sendCourseAccountabilityEmail).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });

  it('does not mark an unsuccessful email as sent or accuse the member of inactivity', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([candidate('pending')] as never);
    vi.mocked(sendCourseAccountabilityEmail).mockResolvedValue({ ok: false, error: 'Fixture delivery failure' });
    expect(await (await GET(request())).json()).toMatchObject({ sent: 0, counselorFollowups: 0 });
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    expect(recordNudgeSent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('returns a quiet result when there are no eligible assignments', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([]);
    expect(await (await GET(request())).json()).toEqual({ sent: 0, scanned: 0, counselorFollowups: 0 });
    expect(sendCourseAccountabilityEmail).not.toHaveBeenCalled();
  });
});
