import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partner: { findMany: vi.fn() }, partnerReferral: { findMany: vi.fn() } } }));
vi.mock('@/lib/email', () => ({ sendPartnerWeeklyDigestEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/pipeline/stage', () => ({
  getPipelineStage: vi.fn(() => 'applied'),
  PIPELINE_STAGE_LABELS: { applied: 'Applied' },
}));
vi.mock('@/lib/member/trainingProgress', () => ({ resolveTrainingProgressAssignment: vi.fn(() => ({ programSlug: null, curriculumVersion: null })) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/pacing', () => ({ createBulkEmailCronPacer: () => ({ run: (send: () => Promise<unknown>) => send(), summary: () => ({}) }) }));

import { GET } from '@/app/api/cron/partner-outcome-digest/route';
import { prisma } from '@/lib/db/prisma';
import { sendPartnerWeeklyDigestEmail } from '@/lib/email';
import { partnerWeeklyDigestHtml } from '@/emails/partner-weekly-digest';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.partner.findMany).mockResolvedValue([{ id: 'partner-1', name: 'Partner', contactEmail: 'partner@example.org' }] as never);
  vi.mocked(prisma.partnerReferral.findMany).mockResolvedValue(Array.from({ length: 22 }, (_, i) => ({
    partnerId: 'partner-1',
    member: {
      id: `member-${i}`,
      fullName: `Member ${i}`,
      email: `member-${i}@example.org`,
      enrolledProgram: null,
      courseEnrollments: [],
      enrolledAt: null,
      assessmentCompleted: false,
      deletedAt: null,
      placementRecord: null,
      userCertifications: [{ certName: `Certification ${i}`, earnedAt: new Date() }],
      applications: [],
      memberProgramProgress: [],
    },
  })) as never);
});

describe('partner outcome digest member cap', () => {
  it('reports all referral stages but names and claims only 20 success lines', async () => {
    const response = await GET(new Request('http://localhost/api/cron/partner-outcome-digest'));
    expect(response.status).toBe(200);
    const email = vi.mocked(sendPartnerWeeklyDigestEmail).mock.calls[0][0];
    expect(email.stageLines).toEqual(['22 in Applied']);
    expect(email.successLines).toHaveLength(20);
    expect(email.subjectMemberIds).toHaveLength(20);
    expect(email.subjectMemberIds).not.toContain('member-20');
    expect(email.additionalSuccessCount).toBe(2);
    expect(prisma.partnerReferral.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerId: { in: ['partner-1'] }, member: { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null } },
    }));
    const html = partnerWeeklyDigestHtml(email);
    expect(html).toContain('2 additional wins');
    expect(html).toContain('partner portal');
    expect(html).not.toContain('Member 20');
  });
});
