import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
const f = vi.hoisted(() => ({
    actor: 'admin', failNextThreadUpdate: false,
    member: '10000000-0000-4000-8000-000000000001', next: '10000000-0000-4000-8000-000000000002',
    state: { assignments: [] as any[], thread: {} as any, messages: [] as any[] },
}));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: f.actor }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async (id: string) => id === 'admin', isAdminInOrg: async (id: string, org: string) => id === 'admin' && org === 'org', isSuperAdmin: async () => false, isCounselor: async () => true }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: any) => fn }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org', getSubjectOrganizationId: async () => 'org' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (_org: string, fn: any) => { const { prisma } = await import('@/lib/db/prisma'); return fn(prisma); } }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/email', () => ({ sendCounselorAssignedEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => { }) }));
vi.mock('@/lib/messages/notifyMemberOfStaffMessageEmail', () => ({
  notifyMemberOfStaffPortalMessageEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => { }) }));
vi.mock('@/lib/db/prisma', () => {
    const prisma: any = {
        user: { updateMany: async () => ({ count: 1 }), findFirst: async () => ({ id: f.member, email: 'synthetic@example.invalid', fullName: 'Synthetic Member', organizationId: 'org' }), findUnique: async () => ({ organizationId: 'org' }), findMany: async () => [] },
        counselor: { findFirst: async () => ({ id: 'new-counselor', userId: f.next, active: true, user: { id: f.next, fullName: 'New Counselor' } }) },
        counselorAssignment: {
            findUnique: async () => null,
            findFirst: async ({ where }: any) => { const a = f.state.assignments.find(a => a.memberId === where.memberId && a.active && (!where.counselor?.userId || a.userId === where.counselor.userId)); return a ? { ...a, counselor: { userId: a.userId, active: true } } : null; },
            updateMany: async () => { f.state.assignments.forEach(a => a.active = false); return { count: 1 }; },
            create: async ({ data }: any) => { const a = { id: 'new-assignment', ...data, userId: f.next }; f.state.assignments.push(a); return a; },
        },
        messageThread: { upsert: async ({ update }: any) => { if (f.failNextThreadUpdate) {
                f.failNextThreadUpdate = false;
                throw new Error('Synthetic thread update failure');
            } Object.assign(f.state.thread, update); return { ...f.state.thread }; }, findUnique: async () => ({ ...f.state.thread }), findFirst: async () => ({ ...f.state.thread }),
            update: async ({ data }: any) => { if (f.failNextThreadUpdate) {
                f.failNextThreadUpdate = false;
                throw new Error('Synthetic thread update failure');
            } Object.assign(f.state.thread, data); return { ...f.state.thread }; } },
        message: { findMany: async () => f.state.messages, create: async ({ data }: any) => { const m = { id: 'new-message', ...data, createdAt: new Date() }; f.state.messages.push(m); return m; } },
        $transaction: async (fn: any) => { const before = structuredClone(f.state); try {
            return await fn(prisma);
        }
        catch (e) {
            f.state = before;
            throw e;
        } },
    };
    return { prisma };
});
import { POST as assign } from '@/app/api/admin/members/[id]/counselor/route';
import { GET as read, POST as post } from '@/app/api/counselor/members/[memberId]/messages/route';
import { assertStaffCanAccessThread, assertStaffCanPost } from '@/lib/messages/counselorThread';
import { NextRequest } from 'next/server';
beforeEach(() => { f.actor = 'admin'; f.failNextThreadUpdate = true; f.state = { assignments: [{ id: 'old-assignment', memberId: f.member, counselorId: 'old-counselor', userId: 'old-counselor-user', active: true }], thread: { id: 'thread', kind: 'member', memberId: f.member, counselorUserId: 'old-counselor-user' }, messages: [{ id: 'history', threadId: 'thread', authorId: f.member, body: 'Synthetic private conversation', createdAt: new Date('2026-09-09T12:00:00Z') }] }; vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterEach(() => vi.restoreAllMocks());
async function handoffFails() { const r = await assign(new NextRequest('http://localhost/api/admin/members/' + f.member + '/counselor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ counselorUserId: f.next }) }), { params: Promise.resolve({ id: f.member }) }); expect(r.status).toBe(500); }
describe('failed handoff must not retain old counselor authority', () => {
    it('rolls assignment and thread routing back together on a thread failure', async () => { await handoffFails(); expect(f.state.assignments.filter(a => a.active).map(a => a.userId)).toEqual(['old-counselor-user']); });
    it('denies historical stale thread owner access after their assignment became inactive', async () => { f.state.assignments[0].active = false; f.actor = 'old-counselor-user'; expect(f.state.assignments.find(a => a.userId === f.actor)?.active).toBe(false); expect(await assertStaffCanAccessThread(f.actor, 'thread')).toBeNull(); expect(await assertStaffCanPost(f.actor, 'thread')).toBeNull(); });
    it('blocks former counselor message read and post even when thread pointer is stale', async () => { f.state.assignments[0].active = false; f.actor = 'old-counselor-user'; const ctx = { params: Promise.resolve({ memberId: f.member }) }; const r = await read(new NextRequest('http://localhost/api/counselor/members/' + f.member + '/messages'), ctx); const p = await post(new NextRequest('http://localhost/api/counselor/members/' + f.member + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Synthetic old counselor reply' }) }), ctx); expect({ readStatus: r.status, postStatus: p.status, createdMessages: f.state.messages.length - 1 }).toEqual({ readStatus: 403, postStatus: 403, createdMessages: 0 }); });
});
