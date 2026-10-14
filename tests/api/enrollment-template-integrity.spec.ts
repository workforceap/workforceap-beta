// @vitest-environment node
/**
 * WAP-304 send and download both refuse a bundled PDF whose bytes no longer
 * match the approved hash. A swapped or missing file must not egress, write a
 * send row, or leak a filename to the caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  actor: vi.fn(),
  access: vi.fn(),
  send: vi.fn(),
  audit: vi.fn(),
  create: vi.fn(),
  member: { id: '11111111-1111-4111-8111-111111111111', fullName: 'Test Student', email: 'student@example.org' },
}));

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { emailSendLog: { create: mocks.create } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: (_org: string, fn: (db: unknown) => unknown) => fn({ user: { findFirst: async () => mocks.member } }),
}));
vi.mock('@/lib/enrollmentAgreements/access', () => ({
  requireAgreementActor: mocks.actor,
  requireAgreementMemberAccess: mocks.access,
  agreementStudentWhere: (organizationId: string) => ({ organizationId }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({
  sendBrandedEmailOrThrowOnSkip: mocks.send,
  isFixtureEmailRecipient: (address: string) => address.endsWith('@example.com'),
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: () => '<p>Blank agreement</p>' }));

import { sendApprovedTemplate } from '@/lib/enrollmentAgreements/templateSend';
import { GET as TEMPLATE } from '@/app/api/enrollment-agreements/template/route';
import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const OP = '33333333-3333-4333-8333-333333333333';
const actor = { id: '55555555-5555-4555-8555-555555555555', organizationId: '22222222-2222-4222-8222-222222222222', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.member.email = 'student@example.org';
  mocks.access.mockResolvedValue({ memberId: MEMBER, organizationId: actor.organizationId, canSendTemplate: true });
  mocks.actor.mockResolvedValue(actor);
  mocks.readFile.mockResolvedValue(Buffer.from('%PDF-1.7\nswapped-template\n%%EOF'));
});
afterEach(() => vi.unstubAllEnvs());

describe('approved enrollment template hash', () => {
  it('refuses a send when bundled bytes no longer match the approved hash', async () => {
    await expect(sendApprovedTemplate(actor, MEMBER, OP, 'student@example.org', null))
      .rejects.toMatchObject({ status: 503, code: 'TEMPLATE_UNAVAILABLE' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses a send when the bundled PDF cannot be read', async () => {
    mocks.readFile.mockRejectedValue(new Error('ENOENT: assets/enrollment/workforceap-enrollment-2026.pdf'));
    await expect(sendApprovedTemplate(actor, MEMBER, OP, 'student@example.org', null))
      .rejects.toMatchObject({ status: 503, code: 'TEMPLATE_UNAVAILABLE' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not download a hash-mismatched template and hides the filename', async () => {
    const response = await TEMPLATE(new Request('https://portal.test/api/enrollment-agreements/template'));
    const body = await response.json() as { code?: string; error?: string };
    expect(response.status).toBe(503);
    expect(body.code).toBe('TEMPLATE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('workforceap-enrollment-2026.pdf');
    expect(mocks.readFile).toHaveBeenCalledOnce();
  });

  it('authenticates before reading template bytes', async () => {
    mocks.actor.mockRejectedValue(new EnrollmentAgreementError(401, 'UNAUTHORIZED', 'Please sign in.'));
    const response = await TEMPLATE(new Request('https://portal.test/api/enrollment-agreements/template'));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('does not leak a missing-file path from the download route', async () => {
    mocks.readFile.mockRejectedValue(new Error('ENOENT: assets/enrollment/workforceap-enrollment-2026.pdf'));
    const response = await TEMPLATE(new Request('https://portal.test/api/enrollment-agreements/template'));
    const raw = await response.text();
    expect(response.status).toBe(503);
    expect(raw).toContain('ENROLLMENT_AGREEMENTS_UNAVAILABLE');
    expect(raw).not.toContain('ENOENT');
    expect(raw).not.toContain('workforceap-enrollment-2026.pdf');
  });
});
