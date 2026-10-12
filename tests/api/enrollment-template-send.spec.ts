// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const OP1 = '33333333-3333-4333-8333-333333333333';
const OP2 = '44444444-4444-4444-8444-444444444444';
const actor = { id: '55555555-5555-4555-8555-555555555555', organizationId: ORG, role: 'admin' };
type Row = Record<string, unknown> & { id: string; dedupeKey: string; status: string; createdAt: Date; updatedAt: Date };

const mocks = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  audit: vi.fn(), access: vi.fn(), send: vi.fn(), failAttemptCreateOnce: false,
  member: { id: '11111111-1111-4111-8111-111111111111', fullName: 'Test Student', email: 'student@example.org' },
}));

let sequence = 0;
const db = vi.hoisted(() => ({
  emailSendLog: {
    async create({ data }: { data: Record<string, unknown> }) {
      const key = String(data.dedupeKey);
      if (key.startsWith('enrollment-template/') && mocks.failAttemptCreateOnce) {
        mocks.failAttemptCreateOnce = false; throw new Error('attempt store unavailable');
      }
      if (mocks.rows.has(key)) throw { code: 'P2002' };
      const now = new Date(Date.now() + sequence++);
      const row: Row = { id: `row-${sequence}`, ...data, dedupeKey: key, status: String(data.status),
        createdAt: data.createdAt instanceof Date ? data.createdAt : now, updatedAt: now };
      mocks.rows.set(key, row);
      return { ...row };
    },
    async findUnique({ where }: { where: { dedupeKey?: string } }) {
      return where.dedupeKey ? { ...mocks.rows.get(where.dedupeKey) } : null;
    },
    async findFirst({ where }: { where: { templateKey: string; entityId: string; userId: string; dedupeKey: { startsWith: string } } }) {
      return [...mocks.rows.values()].filter((row) => row.templateKey === where.templateKey && row.entityId === where.entityId &&
        row.userId === where.userId && row.dedupeKey.startsWith(where.dedupeKey.startsWith))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const row = [...mocks.rows.values()].find((item) => Object.entries(where).every(([key, value]) => item[key] === value));
      if (!row) return { count: 0 };
      for (const [key, value] of Object.entries(data)) row[key] = typeof value === 'object' && value !== null && 'increment' in value
        ? Number(row[key] ?? 0) + Number(value.increment) : value;
      row.updatedAt = new Date(Date.now() + sequence++);
      return { count: 1 };
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = [...mocks.rows.values()].find((item) => item.id === where.id);
      if (!row) throw new Error('missing row');
      Object.assign(row, data); row.updatedAt = new Date(Date.now() + sequence++);
      return { ...row };
    },
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: (_org: string, fn: (db: unknown) => unknown) => fn({ user: { findFirst: async () => mocks.member } }) }));
vi.mock('@/lib/enrollmentAgreements/access', () => ({
  requireAgreementMemberAccess: mocks.access, agreementStudentWhere: (organizationId: string) => ({ organizationId }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send }));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: () => '<p>Blank agreement</p>' }));

import { getTemplateSendView, sendApprovedTemplate } from '@/lib/enrollmentAgreements/templateSend';

beforeEach(() => {
  mocks.rows.clear(); sequence = 0; vi.clearAllMocks();
  mocks.failAttemptCreateOnce = false;
  mocks.member.email = 'student@example.org';
  mocks.access.mockResolvedValue({ memberId: MEMBER, organizationId: ORG, canSendTemplate: true });
  mocks.audit.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ data: { id: 'provider-1' }, error: null });
});

describe('approved enrollment template send', () => {
  it('permits only one of two simultaneous sends confirmed from the same view', async () => {
    const results = await Promise.allSettled([
      sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null),
      sendApprovedTemplate(actor, MEMBER, OP2, 'student@example.org', null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('serializes two distinct operations for one student and sends only once', async () => {
    let complete!: (value: unknown) => void;
    mocks.send.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const first = sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null);
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    await expect(sendApprovedTemplate(actor, MEMBER, OP2, 'student@example.org', null)).rejects.toMatchObject({ code: 'SEND_IN_PROGRESS' });
    complete({ data: { id: 'provider-1' }, error: null });
    await expect(first).resolves.toMatchObject({ alreadyAccepted: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.rows.get(`enrollment-template-gate/${MEMBER}`)).toMatchObject({ provider: 'internal', status: 'gate_idle' });
    expect(mocks.rows.get(`enrollment-template-gate/${MEMBER}`)).not.toHaveProperty('userId');
  });

  it('returns a saved provider receipt for an exact duplicate without egress', async () => {
    await sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null);
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', OP1)).resolves.toMatchObject({ alreadyAccepted: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('rejects an address changed after staff confirmation before writing or sending', async () => {
    mocks.member.email = 'changed@example.org';
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null)).rejects.toMatchObject({ code: 'RECIPIENT_CHANGED' });
    expect(mocks.rows.size).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires durable audit before marking a provider attempt', async () => {
    mocks.audit.mockRejectedValue(new Error('storage unavailable'));
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null)).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rows.get(`enrollment-template/${OP1}`)).toMatchObject({ status: 'failed', provider: 'internal' });
  });

  it('surfaces and recovers a gate left before the attempt row was created', async () => {
    mocks.failAttemptCreateOnce = true;
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null)).rejects.toThrow('attempt store unavailable');
    const gate = mocks.rows.get(`enrollment-template-gate/${MEMBER}`)!;
    gate.updatedAt = new Date(Date.now() - 3 * 60 * 1000);
    const view = await getTemplateSendView(actor, MEMBER);
    expect(view.latest).toMatchObject({ operationId: OP1, canRetry: true });
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', OP1)).resolves.toMatchObject({ alreadyAccepted: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('replays an uncertain provider outcome with the identical key after the in-flight interval', async () => {
    mocks.send.mockRejectedValueOnce(new Error('network timeout'));
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', null)).rejects.toMatchObject({ code: 'SEND_UNCERTAIN' });
    const gate = mocks.rows.get(`enrollment-template-gate/${MEMBER}`)!;
    gate.updatedAt = new Date(Date.now() - 3 * 60 * 1000);
    expect((await getTemplateSendView(actor, MEMBER)).latest).toMatchObject({ operationId: OP1, canRetry: true });
    await expect(sendApprovedTemplate(actor, MEMBER, OP1, 'student@example.org', OP1)).resolves.toMatchObject({ alreadyAccepted: false });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toBe(`enrollment-template/${OP1}`);
    expect(mocks.send.mock.calls[1][1].idempotencyKey).toBe(`enrollment-template/${OP1}`);
  });
});
