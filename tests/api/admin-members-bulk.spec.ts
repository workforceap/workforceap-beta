import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextRequest: class extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  },
  NextResponse: class extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  withAuthGuc: vi.fn((fn: any) => fn()),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: vi.fn(() => Promise.resolve({ domain: 'https://www.workforceap.org', name: 'WorkforceAP' })),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: any) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/email', () => ({
  getResend: vi.fn(),
}));
// bulk-email sends through lib/email/send.ts for real (retry, guards, key);
// members use a non-reserved domain so the fixture guard lets them through.
process.env.UNSUBSCRIBE_TOKEN_SECRET ??= 'test-unsubscribe-secret';
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: vi.fn(() => '<html>email</html>') }));
vi.mock('@/lib/email/escapeHtml', () => ({
  escapeHtml: vi.fn((s: string) => s),
  sanitizeEmailSubjectLine: vi.fn((s: string) => s),
}));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(async (memberId: string) => ({ id: `thread-${memberId}`, memberId })),
}));
vi.mock('@/lib/member/getMemberState', () => ({
  invalidateMemberState: vi.fn(),
}));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn((slug: string) => (slug ? { title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) } : null)),
  isCurriculumMigrationPending: vi.fn(() => false),
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'Training assignment paused.',
}));
vi.mock('@/lib/formatPhone', () => ({ formatPhone: vi.fn((p: string) => p) }));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(),
  createBulkNotifications: vi.fn(),
}));

// ─── Prisma mock ───
const mockTx = {
  user: { updateMany: vi.fn() },
  courseEnrollment: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  message: { create: vi.fn() },
  messageThread: { update: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: 'thread-1' }) },
  counselor: { findFirst: vi.fn() },
  counselorAssignment: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockTx);
      for (const op of fn) await op;
      return undefined;
    }),
    message: { create: vi.fn() },
    messageThread: { update: vi.fn(), findUnique: vi.fn() },
    counselorAssignment: {
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    counselor: {
      findFirst: vi.fn(),
    },
    organizationProgramCatalog: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    memberProgramProgress: {
      findMany: vi.fn(),
    },
    memberEvent: {
      groupBy: vi.fn(),
    },
    courseProgress: {
      groupBy: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(async () => ({})),
    },
  },
}));

// ─── Imports after mocks ───
import { POST as bulkEmailPost } from '@/app/api/admin/members/bulk-email/route';
import { POST as bulkUpdatePost } from '@/app/api/admin/members/bulk-update/route';
import { POST as bulkExportPost } from '@/app/api/admin/members/bulk-export/route';
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getResend } from '@/lib/email';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import { auditLog } from '@/lib/audit';

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const makeRequest = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/admin/members/bulk-email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('Bulk operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.user.updateMany.mockResolvedValue({ count: 1 });
    mockTx.counselor.findFirst.mockImplementation((args) => prisma.counselor.findFirst(args));
    mockTx.courseEnrollment.updateMany.mockResolvedValue({ count: 1 });
    mockTx.courseEnrollment.findMany.mockResolvedValue([]);
    mockTx.courseEnrollment.upsert.mockResolvedValue({ id: 'enrollment-1' });
    mockTx.courseEnrollment.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.counselorAssignment.findFirst.mockResolvedValue(null);
    vi.mocked(invalidateMemberState).mockResolvedValue(undefined);
    vi.mocked(prisma.organizationProgramCatalog.count).mockResolvedValue(0);
    vi.mocked(prisma.organizationProgramCatalog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.courseProgress.groupBy).mockResolvedValue([] as any);
  });

  // ─── Bulk Email ───
  describe('POST /api/admin/members/bulk-email', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getUser).mockResolvedValue(null);
      const res = await bulkEmailPost(makeRequest({ memberIds: [uid(1)], subject: 'Hi', body: 'Hello' }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 403 when not admin', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'user@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(false);
      const res = await bulkEmailPost(makeRequest({ memberIds: [uid(1)], subject: 'Hi', body: 'Hello' }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
    });

    it('returns 400 for invalid input', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      const res = await bulkEmailPost(makeRequest({ memberIds: [], subject: '', body: '' }));
      expect(res.status).toBe(400);
    });

    it('sends emails and creates messages for selected members', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.org', fullName: 'Alice Smith', enrolledProgram: 'data-analytics', organizationId: 'org-1' },
        { id: uid(2), email: 'bob@example.org', fullName: 'Bob Jones', enrolledProgram: null, organizationId: 'org-1' },
      ] as any);

      const sendMock = vi.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null });
      vi.mocked(getResend).mockReturnValue({ emails: { send: sendMock } } as any);

      const res = await bulkEmailPost(
        makeRequest({
          memberIds: [uid(1), uid(2)],
          subject: 'Hi {firstName}',
          body: 'Hello {fullName}, your program is {programName}',
          sendAsEmail: true,
          createMessage: true,
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBe(2);
      expect(body.messagesCreated).toBe(2);
      expect(body.total).toBe(2);
      expect(sendMock).toHaveBeenCalledTimes(2);
      // Each member gets its own campaign-scoped idempotency key.
      const keys = sendMock.mock.calls.map((call) => call[1]?.idempotencyKey as string);
      expect(keys[0]).toMatch(new RegExp(`^bulk-email/[0-9a-f-]{36}/${uid(1)}$`));
      expect(keys[1]).toMatch(new RegExp(`^bulk-email/[0-9a-f-]{36}/${uid(2)}$`));
      expect(keys[0].split('/')[1]).toBe(keys[1].split('/')[1]);

      expect(createNotification).toHaveBeenCalledTimes(2);
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: uid(1),
          type: 'broadcast',
          title: 'Hi Alice',
          body: 'Hello Alice Smith, your program is data-analytics',
          data: expect.objectContaining({ threadId: `thread-${uid(1)}`, authorId: uid(99) }),
        })
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: uid(2),
          type: 'broadcast',
          title: 'Hi Bob',
          body: 'Hello Bob Jones, your program is your program',
          data: expect.objectContaining({ threadId: `thread-${uid(2)}`, authorId: uid(99) }),
        })
      );
    });

    it('reports resolved provider errors without counting success and continues with the next member', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.org', fullName: 'Alice', enrolledProgram: null, organizationId: 'org-1' },
        { id: uid(2), email: 'bob@example.org', fullName: 'Bob', enrolledProgram: null, organizationId: 'org-1' },
      ] as any);
      const sendMock = vi.fn()
        .mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'Recipient rejected' } })
        .mockResolvedValueOnce({ data: { id: 'email-id' }, error: null });
      vi.mocked(getResend).mockReturnValue({ emails: { send: sendMock } } as any);

      const res = await bulkEmailPost(makeRequest({ memberIds: [uid(1), uid(2)], subject: 'Hi', body: 'Hello', sendAsEmail: true, createMessage: true }));
      expect(await res.json()).toEqual({ sent: 1, messagesCreated: 1, total: 2, errors: ['Alice (alice@example.org): Recipient rejected'] });
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(mockTx.message.create).toHaveBeenCalledTimes(1);
      expect(createNotification).toHaveBeenCalledTimes(1);
      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: uid(2) }));
    });

    it('returns 503 when email not configured and sendAsEmail true', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.org', fullName: 'Alice', enrolledProgram: null, organizationId: 'org-1' },
      ] as any);
      vi.mocked(getResend).mockReturnValue(null);

      const res = await bulkEmailPost(
        makeRequest({ memberIds: [uid(1)], subject: 'Hi', body: 'Hello', sendAsEmail: true, createMessage: false })
      );
      expect(res.status).toBe(503);
    });

    it('limits to 100 members', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      const res = await bulkEmailPost(
        makeRequest({ memberIds: Array.from({ length: 101 }, (_, i) => uid(i)), subject: 'Hi', body: 'Hello' })
      );
      expect(res.status).toBe(400);
    });
  });

  // ─── Bulk Update ───
  describe('POST /api/admin/members/bulk-update', () => {
    const makeUpdateRequest = (body: unknown) =>
      new NextRequest('http://localhost:3000/api/admin/members/bulk-update', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });

    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getUser).mockResolvedValue(null);
      const res = await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1)], pipelineStage: 'enrolled' }));
      expect(res.status).toBe(401);
    });

    it('returns 400 when no updates specified', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      const res = await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1)] }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'No updates specified' });
    });

    it('updates pipeline stage for members', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: 'data', pipelineBoardStage: 'applied' },
      ] as any);
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as any);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], pipelineStage: 'enrolled' })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updated).toBe(1);
      expect(body.total).toBe(1);
      expect(invalidateMemberState).toHaveBeenCalledWith(uid(1));
    });

    it('keeps a successful bulk mutation successful when cache invalidation fails', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: null, pipelineBoardStage: 'applied' },
      ] as any);
      vi.mocked(invalidateMemberState).mockRejectedValue(new Error('Redis unavailable'));

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], pipelineStage: 'enrolled' }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updated).toBe(1);
      expect(body.errors).toEqual([]);
      expect(body.warnings).toEqual([
        'Alice: member updated, but cached portal data may take a few minutes to refresh.',
      ]);
    });

    it('updates the user and primary CourseEnrollment in one transaction', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: 'old-program', pipelineBoardStage: 'enrolled' },
      ] as any);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], programSlug: 'new-program' }),
      );

      expect(res.status).toBe(200);
      expect(mockTx.user.updateMany).toHaveBeenCalledWith({
        where: { id: uid(1), organizationId: 'org-1', deletedAt: null },
        data: expect.objectContaining({ enrolledProgram: 'new-program' }),
      });
      expect(mockTx.courseEnrollment.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: uid(1),
          isPrimary: true,
          programSlug: { not: 'new-program' },
        },
        data: { isPrimary: false },
      });
      expect(mockTx.courseEnrollment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_programSlug: { userId: uid(1), programSlug: 'new-program' } },
          create: expect.objectContaining({ organizationId: 'org-1', userId: uid(1), isPrimary: true }),
        }),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('preserves enrollment provenance when the active program is cleared', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: 'old-program', pipelineBoardStage: 'enrolled' },
      ] as any);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], programSlug: null }),
      );

      expect(res.status).toBe(200);
      expect(mockTx.courseEnrollment.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', userId: uid(1), isPrimary: true },
        data: { isPrimary: false },
      });
      expect(mockTx.courseEnrollment.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a global program that is outside an explicit tenant catalog', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.organizationProgramCatalog.count).mockResolvedValue(2);
      vi.mocked(prisma.organizationProgramCatalog.findFirst).mockResolvedValue(null);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], programSlug: 'global-only-program' }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Program is not available for this organization's catalog.",
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(mockTx.user.updateMany).not.toHaveBeenCalled();
    });

    it('requires the tenant catalog entry to be active', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.organizationProgramCatalog.count).mockResolvedValue(1);
      vi.mocked(prisma.organizationProgramCatalog.findFirst).mockResolvedValue(null);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], programSlug: 'global-only-program' }),
      );

      expect(res.status).toBe(400);
      expect(prisma.organizationProgramCatalog.findFirst).toHaveBeenCalledWith({
        where: { programSlug: 'global-only-program', status: 'active' },
        select: { programSlug: true },
      });
      expect(mockTx.user.updateMany).not.toHaveBeenCalled();
    });

    it('validates counselor exists when assigning', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: null, pipelineBoardStage: null },
      ] as any);
      vi.mocked(prisma.counselor.findFirst).mockResolvedValue(null);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], counselorUserId: uid(88) })
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Counselor not found or inactive' });
    });

    it('assigns a counselor in the same transaction when no program change is requested', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: null, pipelineBoardStage: null },
      ] as any);
      vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
        id: 'counselor-1',
        user: { id: uid(88), fullName: 'Case Manager' },
      } as any);
      mockTx.counselorAssignment.findUnique.mockResolvedValue(null);
      mockTx.counselorAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], counselorUserId: uid(88) }),
      );

      expect(res.status).toBe(200);
      expect(mockTx.user.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.courseEnrollment.updateMany).not.toHaveBeenCalled();
      expect(mockTx.counselorAssignment.updateMany).toHaveBeenCalledWith({
        where: { memberId: uid(1), active: true },
        data: { active: false },
      });
      expect(mockTx.counselorAssignment.create).toHaveBeenCalledWith({
        data: { counselorId: 'counselor-1', memberId: uid(1), active: true },
      });
      expect(mockTx.messageThread.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { memberId: uid(1) }, update: { counselorUserId: uid(88) } }));
    });

    it('unassigns a counselor in the same transaction when no program change is requested', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: uid(1), email: 'alice@example.com', fullName: 'Alice', enrolledProgram: null, pipelineBoardStage: null },
      ] as any);

      const res = await bulkUpdatePost(
        makeUpdateRequest({ memberIds: [uid(1)], counselorUserId: null }),
      );

      expect(res.status).toBe(200);
      expect(mockTx.user.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.courseEnrollment.updateMany).not.toHaveBeenCalled();
      expect(mockTx.counselorAssignment.updateMany).toHaveBeenCalledWith({
        where: { memberId: uid(1), active: true },
        data: { active: false },
      });
      expect(mockTx.counselorAssignment.create).not.toHaveBeenCalled();
      expect(mockTx.messageThread.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { memberId: uid(1) }, update: { counselorUserId: null } }));
    });

    describe('counselor handoff and skipped members', () => {
      const actorId = uid(99);
      const newCounselorUserId = uid(88);
      const arrangeAdmin = () => {
        vi.mocked(getUser).mockResolvedValue({ id: actorId, email: 'admin@example.com' } as any);
        vi.mocked(isAdmin).mockResolvedValue(true);
        vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      };
      const inScope = (ids: number[]) => ids.map((n) => ({
        id: uid(n), email: `m${n}@example.com`, fullName: `Member ${n}`, enrolledProgram: null, pipelineBoardStage: null,
      }));
      const arrangeCounselor = () => {
        vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
          id: 'counselor-x', userId: newCounselorUserId, user: { id: newCounselorUserId, fullName: 'Counselor X' },
        } as any);
        mockTx.counselorAssignment.findUnique.mockResolvedValue(null);
        mockTx.counselorAssignment.create.mockResolvedValue({ id: 'assignment-x' });
      };

      it('sends exactly one summary notification to the receiving counselor for a 3-member update', async () => {
        arrangeAdmin();
        arrangeCounselor();
        vi.mocked(prisma.user.findMany).mockResolvedValue(inScope([1, 2, 3]) as any);
        mockTx.counselorAssignment.findFirst.mockResolvedValue({ counselor: { userId: uid(77), user: { fullName: 'Counselor Previous' } } });

        const res = await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1), uid(2), uid(3)], counselorUserId: newCounselorUserId }));

        expect(res.status).toBe(200);
        expect(vi.mocked(createNotification).mock.calls.map(([input]) => input)).toEqual([
          expect.objectContaining({
            userId: newCounselorUserId,
            type: 'task_assigned',
            title: '3 members were assigned to you',
            data: expect.objectContaining({ link: '/counselor/students' }),
          }),
        ]);
      });

      it('audits the previous counselor for each member', async () => {
        arrangeAdmin();
        arrangeCounselor();
        vi.mocked(prisma.user.findMany).mockResolvedValue(inScope([1]) as any);
        mockTx.counselorAssignment.findFirst.mockResolvedValue({ counselor: { userId: uid(77), user: { fullName: 'Counselor Previous' } } });

        await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1)], counselorUserId: newCounselorUserId }));

        expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
          action: 'bulk_update_member',
          targetId: uid(1),
          metadata: expect.objectContaining({
            counselorUserId: newCounselorUserId,
            previousCounselorUserId: uid(77),
            previousCounselorName: 'Counselor Previous',
          }),
        }));
        expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            statementJson: expect.objectContaining({
              result: expect.objectContaining({
                extensions: expect.objectContaining({ previousCounselorUserId: uid(77) }),
              }),
            }),
          }),
        }));
      });

      it('skips the counselor notification for members already on that caseload, for the actor, and for unassign', async () => {
        arrangeAdmin();
        arrangeCounselor();
        vi.mocked(prisma.user.findMany).mockResolvedValue(inScope([1, 2]) as any);
        mockTx.counselorAssignment.findFirst.mockResolvedValue({ counselor: { userId: newCounselorUserId, user: { fullName: 'Counselor X' } } });
        await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1), uid(2)], counselorUserId: newCounselorUserId }));
        expect(createNotification).not.toHaveBeenCalled();

        vi.mocked(getUser).mockResolvedValue({ id: newCounselorUserId, email: 'x@example.com' } as any);
        mockTx.counselorAssignment.findFirst.mockResolvedValue(null);
        await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1), uid(2)], counselorUserId: newCounselorUserId }));
        expect(createNotification).not.toHaveBeenCalled();

        arrangeAdmin();
        await bulkUpdatePost(makeUpdateRequest({ memberIds: [uid(1), uid(2)], counselorUserId: null }));
        expect(createNotification).not.toHaveBeenCalled();
      });

      it('reports requested members outside scope as skipped instead of "N of N"', async () => {
        arrangeAdmin();
        const requested = Array.from({ length: 10 }, (_, i) => uid(i + 1));
        vi.mocked(prisma.user.findMany).mockResolvedValue(inScope([1, 2, 3, 4, 5, 6, 7]) as any);

        const res = await bulkUpdatePost(makeUpdateRequest({ memberIds: requested, pipelineStage: 'enrolled' }));
        const body = await res.json();

        expect(res.status).toBe(207);
        expect(body).toMatchObject({ updated: 7, total: 10, skipped: 3 });
        expect(body.errors).toEqual(['3 selected members were not found or are outside your organization.']);
        expect(JSON.stringify(body)).not.toContain(uid(8));
      });
    });
  });

  // ─── Bulk Export ───
  describe('POST /api/admin/members/bulk-export', () => {
    const makeExportRequest = (body: unknown) =>
      new NextRequest('http://localhost:3000/api/admin/members/bulk-export', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });

    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getUser).mockResolvedValue(null);
      const res = await bulkExportPost(makeExportRequest({ memberIds: [uid(1)] }));
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid input', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      const res = await bulkExportPost(makeExportRequest({ memberIds: [] }));
      expect(res.status).toBe(400);
    });

    it('returns CSV for selected members', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: uid(1),
          fullName: 'Alice',
          email: 'alice@example.com',
          phone: '555-1234',
          enrolledProgram: 'data-analytics',
          enrolledAt: new Date('2024-01-15'),
          assessmentScorePct: 85,
          assessmentCompleted: true,
          pipelineBoardStage: 'enrolled',
          updatedAt: new Date(),
          createdAt: new Date(),
          lastLoginAt: new Date(),
          profile: { profilePhone: null, employmentStatus: 'unemployed', educationLevel: 'high_school' },
          courseEnrollments: [],
          partnerReferrals: [{ partner: { name: 'Goodwill' } }],
          counselorAssignments: [{ counselor: { user: { fullName: 'Carol Counselor' } } }],
        },
      ] as any);
      vi.mocked(prisma.memberProgramProgress.findMany).mockResolvedValue([
        { userId: uid(1), programSlug: 'data-analytics', averagePercent: 75, coursesCompleted: 3 },
      ] as any);
      vi.mocked(prisma.memberEvent.groupBy).mockResolvedValue([
        { userId: uid(1), _max: { createdAt: new Date('2024-06-01') } },
      ] as any);

      const res = await bulkExportPost(makeExportRequest({ memberIds: [uid(1)] }));

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      const text = await res.text();
      expect(text).toContain('Alice');
      expect(text).toContain('alice@example.com');
    });

    it('resolves Program and rollup progress from the enrollment row (audit S17)', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: uid(2),
          fullName: 'Bob',
          email: 'bob@example.com',
          phone: null,
          // No legacy pointer: the assignment lives on the enrollment row, and
          // the rollup was written under the alias slug. Reading
          // `enrolledProgram` blanked all three columns for 11 members.
          enrolledProgram: null,
          enrolledAt: new Date('2024-01-15'),
          assessmentScorePct: null,
          assessmentCompleted: false,
          pipelineBoardStage: 'in_training',
          updatedAt: new Date(),
          createdAt: new Date(),
          lastLoginAt: null,
          profile: null,
          courseEnrollments: [
            { programSlug: 'comptia-a-professional-certificate', curriculumVersion: 'legacy-v1', isPrimary: true },
          ],
          partnerReferrals: [],
          counselorAssignments: [],
        },
      ] as any);
      vi.mocked(prisma.memberProgramProgress.findMany).mockResolvedValue([
        { userId: uid(2), programSlug: 'comptia-a-plus', averagePercent: 24, coursesCompleted: 3 },
      ] as any);
      vi.mocked(prisma.memberEvent.groupBy).mockResolvedValue([] as any);

      const res = await bulkExportPost(makeExportRequest({ memberIds: [uid(2)] }));
      expect(res.status).toBe(200);
      const [header, row] = (await res.text()).split('\n');
      const columns = header.split(',');
      const values = row.split(',');
      expect(values[columns.indexOf('Program')]).not.toBe('');
      expect(values[columns.indexOf('Progress %')]).toBe('24');
      expect(values[columns.indexOf('Courses Completed')]).toBe('3');
    });

    it('"Last Activity" is the newest of a member-driven event, a login and course work', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
      const loginAt = new Date('2026-09-10T00:00:00.000Z');
      const courseAt = new Date('2026-09-18T00:00:00.000Z');
      const eventAt = new Date('2026-09-05T00:00:00.000Z');
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: uid(3), fullName: 'Cara', email: 'cara@example.com', phone: null,
          enrolledProgram: null, enrolledAt: null, assessmentScorePct: null, assessmentCompleted: false,
          pipelineBoardStage: null, updatedAt: new Date(), createdAt: new Date(), lastLoginAt: loginAt,
          profile: null, courseEnrollments: [], partnerReferrals: [], counselorAssignments: [],
        },
      ] as any);
      vi.mocked(prisma.memberProgramProgress.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.memberEvent.groupBy).mockResolvedValue([
        { userId: uid(3), _max: { createdAt: eventAt } },
      ] as any);
      vi.mocked(prisma.courseProgress.groupBy).mockResolvedValue([
        { userId: uid(3), _max: { lastActivityAt: courseAt } },
      ] as any);

      const res = await bulkExportPost(makeExportRequest({ memberIds: [uid(3)] }));
      expect(res.status).toBe(200);
      const [header, row] = (await res.text()).split('\n');
      const columns = header.split(',');
      const values = row.split(',');
      // The newest of the three wins (course work here), not just the last event.
      expect(values[columns.indexOf('Last Activity')]).toBe(courseAt.toISOString());
      // And the event aggregate excludes system-sent mail, as Health does.
      const eventWhere = vi.mocked(prisma.memberEvent.groupBy).mock.calls[0][0].where as any;
      expect(eventWhere.eventName.notIn).toContain('inactive_nudge_sent');
      expect(eventWhere.eventName.notIn).toContain('counselor_nudge_sent');
    });

    it('limits to 500 members', async () => {
      vi.mocked(getUser).mockResolvedValue({ id: uid(99), email: 'admin@example.com' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      const res = await bulkExportPost(makeExportRequest({ memberIds: Array.from({ length: 501 }, (_, i) => uid(i)) }));
      expect(res.status).toBe(400);
    });
  });
});
