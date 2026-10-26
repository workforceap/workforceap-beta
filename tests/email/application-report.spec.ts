// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationReportFixture } from '../fixtures/applicationReport';

const h = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn() }));
vi.mock('resend', () => ({ Resend: class {} }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: h.send, FixtureRecipientSkippedError: class extends Error {} }));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: async () => 'org-workforceap' }));
vi.mock('@/lib/apply/applicationReportFile', () => ({ applicationReportFile: h.render }));
import { sendNewApplicationAdminEmail } from '@/lib/email';

const params = () => ({ applicantName: 'Synthetic Applicant', applicantEmail: 'alex+test@example.test', applicantPhone: '5125550123', programInterest: 'Training', applicationId: 'app-A', memberId: 'member-A', organizationId: 'org-workforceap', applicationReport: applicationReportFixture() });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 're_test_only'); vi.stubEnv('EMAIL_TO_ADMIN', 'filing@example.test');
  h.send.mockResolvedValue({ ok: true }); h.render.mockResolvedValue({ filename: 'application-app-A.pdf', content: Buffer.from('%PDF-synthetic') });
});
afterEach(() => vi.unstubAllEnvs());
describe('staff application report email', () => {
  it('attaches the saved report, includes answers and links to the correct member profile', async () => {
    expect(await sendNewApplicationAdminEmail(params())).toEqual({ ok: true });
    const args = h.send.mock.calls[0][1];
    expect(args.to).toEqual(['filing@example.test']); expect(args.html).toContain('Example Company');
    expect(args.html).toContain('/admin/members/member-A?tab=eligibility');
    expect(args.attachments[0].filename).toBe('application-app-A.pdf');
    expect(args.idempotencyKey).toBe('application-staff-report-v1/app-A');
    expect(args.template).toBeUndefined(); // No sensitive replay payload in diagnostics.
    expect(h.render).toHaveBeenCalledWith(params().applicationReport, 'app-A');
  });
  it('does not send another tenant’s applicant to the global WorkforceAP alert list', async () => {
    expect(await sendNewApplicationAdminEmail({ ...params(), organizationId: 'other-org' })).toMatchObject({ skipped: true });
    expect(h.send).not.toHaveBeenCalled(); expect(h.render).not.toHaveBeenCalled();
  });
  it('requires an organization before including a detailed report', async () => {
    await sendNewApplicationAdminEmail({ ...params(), organizationId: undefined });
    expect(h.send.mock.calls[0][1].attachments).toBeUndefined();
    expect(h.send.mock.calls[0][1].html).not.toContain('Example Company');
  });
});
