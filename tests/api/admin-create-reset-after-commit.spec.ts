import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), isSuperAdmin: vi.fn(), isAdminInOrg: vi.fn(),
  getOrg: vi.fn(), roster: vi.fn(), invite: vi.fn(), createAuth: vi.fn(), deleteAuth: vi.fn(),
  reset: vi.fn(), userCreate: vi.fn(), profileCreate: vi.fn(), transaction: vi.fn(),
  upsertEnrollment: vi.fn(), lockCoursera: vi.fn(), mapCoursera: vi.fn(), promoteCsv: vi.fn(),
  auditLog: vi.fn(), logAuditEvent: vi.fn(), captureApiError: vi.fn(),
  committed: false,
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
    ...init, headers: { 'content-type': 'application/json' },
  }) },
  after: vi.fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: h.isAdmin, isSuperAdmin: h.isSuperAdmin, isAdminInOrg: h.isAdminInOrg }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: h.getOrg }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => unknown) => fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: h.transaction,
    user: { create: h.userCreate }, profile: { create: h.profileCreate },
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ auth: { admin: {
  inviteUserByEmail: h.invite, createUser: h.createAuth, deleteUser: h.deleteAuth,
} } }) }));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: h.reset }));
vi.mock('@/lib/content/programs', () => ({
  CURRICULUM_MIGRATION_PENDING_CODE: 'pending', CURRICULUM_MIGRATION_PENDING_MESSAGE: 'Pending',
  getProgramBySlug: (slug: string) => ({ slug, title: 'IT Support', curriculumMigrationPending: false }),
  isCurriculumMigrationPending: () => false,
}));
vi.mock('@/lib/content/programSlug', () => ({ canonicalizeProgramSlug: (slug: string) => slug }));
vi.mock('@/lib/referralSources', () => ({ ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES: [] }));
vi.mock('@/lib/auth/provisionIntent', () => ({ provisionIntentAppMetadata: () => ({}) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ activeCurriculumVersion: () => 'v2' }));
vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({ upsertEquivalentCourseEnrollment: h.upsertEnrollment }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: () => ({}), logAuditEvent: h.logAuditEvent }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: h.captureApiError }));
vi.mock('@/lib/coursera/b4bClient', () => ({ listAllUsers: h.roster }));
vi.mock('@/lib/coursera/csvImport.server', () => ({
  lockCourseraIdentityForAttachment: h.lockCoursera,
  promoteCsvProgressToCanonical: h.promoteCsv,
}));
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({ mapCourseraIdentityAndProgressInTransaction: h.mapCoursera }));

import { POST as createAdminMember } from '@/app/api/admin/members/create/route';
import { POST as addCourseraLearner } from '@/app/api/admin/coursera/reconcile/add-to-wap/route';

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  h.committed = false;
  h.getUser.mockResolvedValue({ id: 'admin-1' });
  h.isAdmin.mockResolvedValue(true);
  h.isSuperAdmin.mockResolvedValue(true);
  h.getOrg.mockResolvedValue('org-1');
  h.invite.mockResolvedValue({ data: { user: null }, error: { message: 'Invite unavailable' } });
  h.createAuth.mockResolvedValue({ data: { user: { id: 'member-1', email: 'jane@example.org' } }, error: null });
  h.deleteAuth.mockResolvedValue({ error: null });
  h.userCreate.mockResolvedValue({ id: 'member-1', email: 'jane@example.org', fullName: 'Jane Doe' });
  h.profileCreate.mockResolvedValue({});
  h.upsertEnrollment.mockResolvedValue({ id: 'enrollment-1' });
  h.lockCoursera.mockResolvedValue(undefined);
  h.mapCoursera.mockResolvedValue(undefined);
  h.promoteCsv.mockResolvedValue(undefined);
  h.auditLog.mockResolvedValue(undefined);
  h.logAuditEvent.mockResolvedValue(undefined);
  h.roster.mockResolvedValue({ elements: [{ email: 'jane@example.org', externalId: 'coursera-1' }] });
  h.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn({ user: { create: h.userCreate }, profile: { create: h.profileCreate } });
    h.committed = true;
    return result;
  });
  h.reset.mockImplementation(async () => h.committed
    ? { error: null, via: 'resend' }
    : { error: { message: 'User not found' }, via: 'skipped' });
});

describe('admin create fallback reset ordering', () => {
  it('sends the reset only after the member transaction commits', async () => {
    const response = await createAdminMember(request('/api/admin/members/create', {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.org',
      usCitizen: true, authorizedToWork: true, programSlug: 'it-support',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, welcomeEmailSent: true });
    expect(h.reset).toHaveBeenCalledWith('jane@example.org', '/reset-password', { orgId: 'org-1' });
    expect(h.committed).toBe(true);
  });

  it('does not send a reset when the member transaction fails', async () => {
    h.transaction.mockRejectedValueOnce(new Error('write failed'));
    const response = await createAdminMember(request('/api/admin/members/create', {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.org',
      usCitizen: true, authorizedToWork: true, programSlug: 'it-support',
    }));

    expect(response.status).toBe(500);
    expect(h.reset).not.toHaveBeenCalled();
    expect(h.deleteAuth).toHaveBeenCalledWith('member-1');
  });

  it('reports a resolved reset skip as an unconfirmed welcome email', async () => {
    h.reset.mockResolvedValue({ error: { message: 'User not found' }, via: 'skipped' });
    const response = await createAdminMember(request('/api/admin/members/create', {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.org',
      usCitizen: true, authorizedToWork: true, programSlug: 'it-support',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, welcomeEmailSent: false });
  });
});

describe('Coursera add-to-WAP fallback reset ordering', () => {
  it('sends the reset only after the User and mapping transaction commits', async () => {
    const response = await addCourseraLearner(request('/api/admin/coursera/reconcile/add-to-wap', {
      email: 'jane@example.org', courseraExternalId: 'coursera-1', programId: 'program-1',
    }) as Parameters<typeof addCourseraLearner>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, userId: 'member-1', welcomeEmailSent: true });
    expect(h.reset).toHaveBeenCalledWith('jane@example.org', '/reset-password', { orgId: 'org-1' });
    expect(h.committed).toBe(true);
  });

  it('does not send a reset when User creation fails', async () => {
    h.transaction.mockRejectedValueOnce(new Error('write failed'));
    const response = await addCourseraLearner(request('/api/admin/coursera/reconcile/add-to-wap', {
      email: 'jane@example.org', courseraExternalId: 'coursera-1', programId: 'program-1',
    }) as Parameters<typeof addCourseraLearner>[0]);

    expect(response.status).toBe(500);
    expect(h.reset).not.toHaveBeenCalled();
    expect(h.deleteAuth).toHaveBeenCalledWith('member-1');
  });

  it('reports a resolved reset skip without leaking recipient or provider text', async () => {
    h.reset.mockResolvedValue({ error: { message: 'Private jane@example.org provider detail' }, via: 'skipped' });
    const response = await addCourseraLearner(request('/api/admin/coursera/reconcile/add-to-wap', {
      email: 'jane@example.org', courseraExternalId: 'coursera-1', programId: 'program-1',
    }) as Parameters<typeof addCourseraLearner>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, welcomeEmailSent: false });
    expect(h.captureApiError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      extra: { stage: 'set-password-email', via: 'skipped' },
    }));
    expect((h.captureApiError.mock.calls[0][0] as Error).message).toBe('Password reset email was not confirmed');
    expect(h.captureApiError.mock.calls[0][1].extra).not.toHaveProperty('email');
  });

  it('keeps the Auth user when post-commit projection fails', async () => {
    h.promoteCsv.mockRejectedValue(new Error('projection unavailable'));
    const response = await addCourseraLearner(request('/api/admin/coursera/reconcile/add-to-wap', {
      email: 'jane@example.org', courseraExternalId: 'coursera-1', programId: 'program-1',
    }) as Parameters<typeof addCourseraLearner>[0]);

    expect(response.status).toBe(500);
    expect(h.committed).toBe(true);
    expect(h.reset).toHaveBeenCalledOnce();
    expect(h.deleteAuth).not.toHaveBeenCalled();
  });
});
