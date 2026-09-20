import { describe, it, expect, vi, beforeEach } from 'vitest';

// Behavioural replacement for the former lib/notify/discord.test.ts source
// sweep: the member and employer application-message routes must hand their
// Discord bridge to Next `after()` (request-retained), never abandon it with
// `void`, and never await it on the response path.

const discord = vi.hoisted(() => ({ notify: vi.fn<(input: unknown) => Promise<void>>(async () => undefined) }));
const lifetime = vi.hoisted(() => ({ after: vi.fn() }));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
    after: lifetime.after,
  };
});

vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: discord.notify }));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/messages/rateLimit', () => ({
  checkMessageRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/db/prisma', () => {
  const prisma: any = {
    jobPostingApplication: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
    applicationMessage: { create: vi.fn(), updateMany: vi.fn(async () => ({ count: 0 })) },
  };
  prisma.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma };
});

// ─── Imports after mocks ───
import { POST as memberPost } from '@/app/api/member/applications/[id]/messages/route';
import { POST as employerPost } from '@/app/api/employer/applications/[id]/messages/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const params = { params: Promise.resolve({ id: 'app-1' }) };

function makeRequest(body: unknown, path: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

/** Runs every callback the route registered with after() and returns how many there were. */
async function flushAfter(): Promise<number> {
  const callbacks = lifetime.after.mock.calls.map(([task]) => task as () => unknown);
  for (const callback of callbacks) await callback();
  return callbacks.length;
}

const createdMessage = {
  id: 'msg-1',
  body: 'Hello there',
  createdAt: new Date('2026-09-01T10:00:00Z'),
  author: { fullName: 'Jane' },
};

describe('application message routes retain Discord work with after()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discord.notify.mockResolvedValue(undefined);
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({ id: 'app-1', studentId: 'member-1' } as any);
    vi.mocked(prisma.applicationMessage.create).mockResolvedValue(createdMessage as any);
  });

  it('member POST writes the message, then schedules exactly one Discord notification via after()', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as any);

    const res = await memberPost(makeRequest({ body: '  Hello there  ' }, '/api/member/applications/app-1/messages'), params);

    expect(res.status).toBe(200);
    expect(prisma.applicationMessage.create).toHaveBeenCalledTimes(1);
    // Registered with Next, not awaited on the response path and not fired directly.
    expect(lifetime.after).toHaveBeenCalledTimes(1);
    expect(discord.notify).not.toHaveBeenCalled();
    // The DB write lands before the bridge is registered, so a Discord ping
    // never describes a message that failed to persist.
    const createOrder = vi.mocked(prisma.applicationMessage.create).mock.invocationCallOrder[0];
    const afterOrder = lifetime.after.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(afterOrder);

    expect(await flushAfter()).toBe(1);
    expect(discord.notify).toHaveBeenCalledTimes(1);
    expect(discord.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'application_message',
        body: 'Hello there',
        fields: expect.arrayContaining([
          { name: 'applicationId', value: 'app-1' },
          { name: 'authorId', value: 'member-1' },
        ]),
      }),
    );
  });

  it('employer POST schedules exactly one Discord notification via after() carrying the employer id', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-9' } as any);

    const res = await employerPost(makeRequest({ body: 'Hello there' }, '/api/employer/applications/app-1/messages'), params);

    expect(res.status).toBe(200);
    expect(lifetime.after).toHaveBeenCalledTimes(1);
    expect(discord.notify).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.applicationMessage.create).mock.invocationCallOrder[0]).toBeLessThan(
      lifetime.after.mock.invocationCallOrder[0],
    );

    expect(await flushAfter()).toBe(1);
    expect(discord.notify).toHaveBeenCalledTimes(1);
    expect(discord.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'application_message',
        fields: expect.arrayContaining([
          { name: 'applicationId', value: 'app-1' },
          { name: 'authorId', value: 'employer-user-1' },
          { name: 'employerId', value: 'emp-9' },
        ]),
      }),
    );
  });

  it('a Discord failure inside the retained callback never reaches the response or the DB write', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as any);
    discord.notify.mockRejectedValueOnce(new Error('webhook down'));

    const res = await memberPost(makeRequest({ body: 'Hello there' }, '/api/member/applications/app-1/messages'), params);
    expect(res.status).toBe(200);

    const [task] = lifetime.after.mock.calls[0] as [() => Promise<unknown>];
    await expect(task()).rejects.toThrow('webhook down');
    expect(prisma.applicationMessage.create).toHaveBeenCalledTimes(1);
  });

  it('rejected input registers no Discord work at all', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as any);

    const res = await memberPost(makeRequest({ body: '' }, '/api/member/applications/app-1/messages'), params);

    expect(res.status).toBe(400);
    expect(prisma.applicationMessage.create).not.toHaveBeenCalled();
    expect(lifetime.after).not.toHaveBeenCalled();
    expect(discord.notify).not.toHaveBeenCalled();
  });
});
