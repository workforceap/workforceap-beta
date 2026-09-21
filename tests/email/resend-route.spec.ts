/**
 * WAP-163: an admin can re-send a recorded failure; the same template is
 * invoked with the same payload, the outcome is recorded and audit-logged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn(), captureApiResponseError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { workflowDiagnostic: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/email', () => ({
  sendApplicantFollowupEmail: vi.fn(),
  sendApplicantChaseEmail: vi.fn(),
  sendAdminPendingApplicantsEmail: vi.fn(),
  sendApplicantAgingDigestEmail: vi.fn(),
  sendApplicationAcceptedEmail: vi.fn(),
  sendApplicationRejectedEmail: vi.fn(),
  sendCourseKickoffEmail: vi.fn(),
  sendCourseEnrolledEmail: vi.fn(),
  sendEnrollmentConfirmationEmail: vi.fn(),
}));

import { POST } from '@/app/api/admin/email-failures/[id]/resend/route';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { auditLog } from '@/lib/audit';
import { sendApplicantFollowupEmail, sendCourseKickoffEmail } from '@/lib/email';
import { RESENDABLE_TEMPLATE_NAMES, getResendableTemplate, validateResendParams } from '@/lib/email/resendRegistry';

const call = (id = 'diag-1') =>
  (POST as unknown as (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>)(
    new Request(`http://localhost/api/admin/email-failures/${id}/resend`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  );

const failedRow = (metadata: Record<string, unknown>) => ({
  id: 'diag-1',
  createdAt: new Date('2026-08-01T10:00:00Z'),
  metadata,
});

const replayable = {
  to: ['ada@example.org'],
  subject: 'Your WorkforceAP Application is Being Reviewed',
  template: 'applicant_followup',
  templateParams: { to: 'ada@example.org', fullName: 'Ada Lovelace' },
  errorClass: 'header_invalid',
  retryable: true,
  resendable: true,
  recipientHash: 'abc',
  failedAt: '2026-08-01T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as never);
  vi.mocked(requireAdmin).mockResolvedValue(undefined);
  vi.mocked(prisma.workflowDiagnostic.create).mockResolvedValue({ id: 'diag-2' } as never);
  vi.mocked(prisma.workflowDiagnostic.update).mockResolvedValue({} as never);
  vi.mocked(sendApplicantFollowupEmail).mockResolvedValue({ ok: true });
});

describe('resend registry', () => {
  it('exposes only templates whose wrappers store their params, and no security mail', () => {
    expect(RESENDABLE_TEMPLATE_NAMES).toEqual(expect.arrayContaining([
      'applicant_followup', 'applicant_chase', 'admin_pending_applicants', 'applicant_aging_digest',
      'application_accepted', 'application_rejected', 'course_kickoff', 'course_enrolled', 'enrollment_confirmation',
    ]));
    expect(RESENDABLE_TEMPLATE_NAMES.join(' ')).not.toMatch(/password|login|magic|invite|verify|mfa/i);
    expect(getResendableTemplate('password_reset')).toBeNull();
    expect(getResendableTemplate(null)).toBeNull();
  });

  it('validates the stored payload before replaying it', () => {
    const kickoff = getResendableTemplate('course_kickoff')!;
    expect(validateResendParams(kickoff, { to: 'a@example.org', fullName: 'A', programName: 'P' })).toBeNull();
    expect(validateResendParams(kickoff, { to: 'a@example.org', fullName: 'A' })).toBe('programName');
    expect(validateResendParams(kickoff, { to: '', fullName: 'A', programName: 'P' })).toBe('to');
    const digest = getResendableTemplate('applicant_aging_digest')!;
    expect(validateResendParams(digest, { to: [], total: 1, buckets: [], oldest: [], queueLink: 'x', memberAdminBaseUrl: 'y' })).toBe('to');
  });

  it('invokes the wrapper the template names with the stored params', async () => {
    vi.mocked(sendCourseKickoffEmail).mockResolvedValue({ ok: true });
    const params = { to: 'a@example.org', fullName: 'A', programName: 'IT Support' };
    await getResendableTemplate('course_kickoff')!.send(params);
    expect(sendCourseKickoffEmail).toHaveBeenCalledExactlyOnceWith(params);
  });
});

describe('POST /api/admin/email-failures/[id]/resend', () => {
  it('requires an authenticated admin', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    expect((await call()).status).toBe(401);
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Forbidden'));
    expect((await call()).status).toBe(403);
    expect(sendApplicantFollowupEmail).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('404s when the row is not a recorded email_send error', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(null);
    const res = await call('nope');
    expect(res.status).toBe(404);
    expect(prisma.workflowDiagnostic.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'nope', workflow: 'email_send', status: 'error' },
    }));
  });

  it('refuses the historical rows that were recorded without a template (422, nothing sent, nothing audited)', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow({ to: ['x@example.org'], subject: 'We Miss You' }) as never);
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/without a replayable template/) });
    expect(sendApplicantFollowupEmail).not.toHaveBeenCalled();
    expect(prisma.workflowDiagnostic.create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('refuses a row whose stored payload was redacted at write time (422, nothing sent)', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(
      failedRow({ ...replayable, templateParams: { to: '[redacted]', fullName: '[redacted]' } }) as never,
    );
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/redacted/) });
    expect(sendApplicantFollowupEmail).not.toHaveBeenCalled();
    expect(prisma.workflowDiagnostic.create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('refuses a row whose stored payload is incomplete', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow({ ...replayable, templateParams: { to: 'ada@example.org' } }) as never);
    expect((await call()).status).toBe(422);
    expect(sendApplicantFollowupEmail).not.toHaveBeenCalled();
  });

  it('refuses to send twice once a re-send succeeded (409)', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow({ ...replayable, resentAt: '2026-09-19T00:00:00.000Z', resentOk: true }) as never);
    expect((await call()).status).toBe(409);
    expect(sendApplicantFollowupEmail).not.toHaveBeenCalled();
  });

  it('re-invokes the same template with the same payload, records the outcome, stamps the original and audits', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow(replayable) as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, resendDiagnosticId: 'diag-2' });

    expect(sendApplicantFollowupEmail).toHaveBeenCalledExactlyOnceWith({ to: 'ada@example.org', fullName: 'Ada Lovelace' });

    expect(prisma.workflowDiagnostic.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workflow: 'email_send', status: 'success', method: 'admin_resend', actorUserId: 'admin-1',
        entityType: 'email_template', entityId: 'applicant_followup', failureReason: null,
        metadata: expect.objectContaining({ sourceDiagnosticId: 'diag-1', template: 'applicant_followup' }),
      }),
    }));
    expect(prisma.workflowDiagnostic.update).toHaveBeenCalledWith({
      where: { id: 'diag-1' },
      data: { metadata: expect.objectContaining({ ...replayable, resentOk: true, resentDiagnosticId: 'diag-2', resentAt: expect.any(String) }) },
    });
    expect(auditLog).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actorUserId: 'admin-1', action: 'email_resend', targetType: 'workflow_diagnostic', targetId: 'diag-1',
      metadata: expect.objectContaining({ template: 'applicant_followup', ok: true, resendDiagnosticId: 'diag-2' }),
    }));
  });

  it('records and audits a refused re-send without echoing provider text, and leaves the row re-sendable', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow(replayable) as never);
    vi.mocked(sendApplicantFollowupEmail).mockResolvedValue({ ok: false, error: 'Resend API: internal_server_error at 10.0.0.1' });
    const res = await call();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('10.0.0.1');

    expect(prisma.workflowDiagnostic.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error', method: 'admin_resend', failureReason: 'Resend API: internal_server_error at 10.0.0.1' }),
    }));
    expect(prisma.workflowDiagnostic.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { metadata: expect.objectContaining({ resentOk: false }) },
    }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ ok: false }) }));
  });

  it('treats a fixture-recipient skip as not sent (422) rather than a delivery', async () => {
    vi.mocked(prisma.workflowDiagnostic.findFirst).mockResolvedValue(failedRow(replayable) as never);
    vi.mocked(sendApplicantFollowupEmail).mockResolvedValue({ ok: false, skipped: true, error: 'fixture_recipient' });
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringMatching(/fixture/) });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ ok: false, skipped: true }) }));
  });
});
