import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ member: vi.fn(), pending: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'member-1' }) }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: async () => undefined }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => undefined }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => {
  const tx = { user: { findUnique: db.member }, programChangeRequest: { findFirst: db.pending, create: db.create } };
  return { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } };
});
import { POST } from '@/app/api/member/program-change-request/route';
const enrollment = (programSlug = 'primary-program', isPrimary = true) => ({ programSlug, isPrimary, curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-09-01') });
const request = () => new NextRequest('https://example.test/api/member/program-change-request', { method: 'POST', body: JSON.stringify({ requestedProgramSlug: 'desired-program', reason: 'A different career direction' }) });
beforeEach(() => { vi.clearAllMocks(); db.pending.mockResolvedValue(null); db.create.mockResolvedValue({ id: 'request-1' }); });

describe('program change request source assignment', () => {
  it.each([
    { enrolledProgram: null, courseEnrollments: [enrollment()], expected: 'primary-program' },
    { enrolledProgram: 'old-program', courseEnrollments: [enrollment()], expected: 'primary-program' },
    { enrolledProgram: 'legacy-program', courseEnrollments: [], expected: 'legacy-program' },
    { enrolledProgram: 'stale-program', courseEnrollments: [enrollment('different-history', false)], expected: null },
  ])('snapshots the confirmed assignment for %j', async ({ expected, ...member }) => {
    db.member.mockResolvedValue(member);
    expect((await POST(request())).status).toBe(200);
    expect(db.create).toHaveBeenCalledWith({ data: { userId: 'member-1', currentProgramSlug: expected,
      requestedProgramSlug: 'desired-program', reason: 'A different career direction' } });
    expect(db.member.mock.calls[0][0].select.courseEnrollments.where).toEqual({ organizationId: 'org-1' });
  });
  it('preserves the pending-request conflict and does not create or change an enrollment', async () => {
    db.member.mockResolvedValue({ enrolledProgram: null, courseEnrollments: [enrollment()] });
    db.pending.mockResolvedValue({ id: 'existing' });
    expect((await POST(request())).status).toBe(409);
    expect(db.create).not.toHaveBeenCalled();
  });
});
