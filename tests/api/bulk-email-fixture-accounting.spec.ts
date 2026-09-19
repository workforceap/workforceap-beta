import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  partnerFindMany: vi.fn(),
  referralFindMany: vi.fn(),
  cronFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  jobFindMany: vi.fn(),
  partnerEmail: vi.fn(),
  jobEmail: vi.fn(),
  notification: vi.fn(),
  records: vi.fn(),
  log: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_name: string, handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findMany: mocks.partnerFindMany },
    partnerReferral: { findMany: mocks.referralFindMany },
    cronExecution: { findFirst: mocks.cronFindFirst },
    user: { findMany: mocks.userFindMany },
    job: { findMany: mocks.jobFindMany },
  },
}));
vi.mock('@/lib/email', () => ({
  sendPartnerWeeklyDigestEmail: mocks.partnerEmail,
  sendJobAlertDigestEmail: mocks.jobEmail,
}));
vi.mock('@/lib/notifications/create', () => ({ createNotification: mocks.notification }));
vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: mocks.records,
  getCurrentCronExecutionId: vi.fn(() => null),
}));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: mocks.log }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/pipeline/stage', () => ({
  getPipelineStage: vi.fn(() => 'enrolled'),
  PIPELINE_STAGE_LABELS: { enrolled: 'Enrolled' },
}));
vi.mock('@/lib/member/trainingProgress', () => ({
  resolveTrainingProgressAssignment: vi.fn(() => ({ programSlug: 'program-one', curriculumVersion: 'legacy-v1' })),
}));

import { GET as partnerDigest } from '@/app/api/cron/partner-outcome-digest/route';
import { GET as jobAlerts } from '@/app/api/cron/job-alerts/route';

describe('bulk email fixture accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notification.mockResolvedValue(undefined);
  });

  it('partner digest counts a fixture recipient as skipped, not failed or sent', async () => {
    mocks.partnerFindMany.mockResolvedValue([{ id: 'partner-1', name: 'Partner', contactEmail: 'fixture@example.com' }]);
    mocks.referralFindMany.mockResolvedValue([{
      partnerId: 'partner-1',
      member: {
        id: 'member-1', fullName: 'Member', email: 'member@workforceap.org', enrolledProgram: 'program-one',
        courseEnrollments: [], enrolledAt: new Date(), assessmentCompleted: true, deletedAt: null,
        placementRecord: null, userCertifications: [], applications: [], memberProgramProgress: [],
      },
    }]);
    mocks.partnerEmail.mockResolvedValue({ ok: false, skipped: true, error: 'fixture_recipient' });

    const response = await partnerDigest(new Request('http://test/api/cron/partner-outcome-digest'));
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.results[0]).toMatchObject({ emailSent: false, skipped: true, error: 'fixture_recipient' });
    expect(mocks.records).toHaveBeenCalledWith(0);
    expect(mocks.log).toHaveBeenCalledWith('cron_partner_digest', expect.objectContaining({ sent: 0, skipped: 1, failed: 0 }), 'ok');
  });

  it('job alerts separate in-app processing from fixture-skipped email acceptance', async () => {
    mocks.cronFindFirst.mockResolvedValue(null);
    mocks.userFindMany.mockResolvedValue([{ id: 'member-1', email: 'fixture@example.com', fullName: 'Member', enrolledProgram: 'program-one' }]);
    mocks.jobFindMany.mockResolvedValue([{ id: 'job-1', title: 'Role', location: 'Remote', employer: { companyName: 'Employer' } }]);
    mocks.jobEmail.mockResolvedValue({ ok: false, skipped: true, error: 'fixture_recipient' });

    const response = await jobAlerts(new Request('http://test/api/cron/job-alerts'));
    const body = await response.json();
    expect(body).toMatchObject({ notificationsCreated: 1, emailsAccepted: 0, emailsSkipped: 1, emailFailures: 0 });
    expect(mocks.notification).toHaveBeenCalledOnce();
    expect(mocks.records).toHaveBeenCalledWith(1);
  });
});
