import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ─── Mocks ─── */

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
  };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const cronExecution = {
    findFirst: vi.fn(),
    count: vi.fn(),
  };
  const webhookEvent = {
    count: vi.fn(),
    findFirst: vi.fn(),
  };
  const xapiStatement = {
    count: vi.fn(),
  };
  const aIToolResult = {
    count: vi.fn(),
  };
  const workflowDiagnostic = {
    count: vi.fn(),
  };
  // Delivery-audit checks (emailDelivery / webPush) read these models.
  const emailSendLog = {
    count: vi.fn(),
  };
  const pushSubscription = {
    count: vi.fn(),
  };
  return {
    prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
      $queryRaw: vi.fn(),
      cronExecution,
      webhookEvent,
      xapiStatement,
      aIToolResult,
      workflowDiagnostic,
      emailSendLog,
      pushSubscription,
    },
  };
});

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () {
    return {
      ping: vi.fn(async () => 'PONG'),
    };
  }),
}));

/* ─── Imports after mocks ─── */

import { GET } from '@/app/api/admin/health/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { Redis } from '@upstash/redis';

describe('GET /api/admin/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    process.env.RESEND_API_KEY = 'resend-key';
    // emailDelivery reports degraded until the Resend webhook secret is set.
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not an admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns healthy when all subsystems are ok', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }] as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue({
      startedAt: new Date(),
      status: 'SUCCESS',
      jobName: 'test-job',
    } as any);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.prisma.status).toBe('ok');
    expect(body.checks.cronJobs.status).toBe('ok');
    expect(body.checks.webhooks.status).toBe('ok');
    expect(body.checks.xapi.status).toBe('ok');
    expect(body.checks.aiTools.status).toBe('ok');
    expect(body.checks.email.status).toBe('ok');
    expect(body.checks.emailDelivery.status).toBe('ok');
    expect(body.checks.discordNotifications.status).toBe('ok');
    expect(body.checks.webPush.status).toBe('ok');
    expect(body.generatedAt).toBeDefined();
  });

  it('returns an audit placeholder without consuming provider diagnostics', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const res = await GET(new Request('http://localhost:3000/api/admin/health', {
      headers: { 'x-workforceap-read-only-audit': '1' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'degraded',
      auditSuppressed: true,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('returns degraded when one subsystem is degraded', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }] as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue({
      startedAt: new Date(),
      status: 'SUCCESS',
      jobName: 'test-job',
    } as any);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(2); // 2 failures = degraded
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('degraded');
    expect(body.checks.cronJobs.status).toBe('degraded');
    expect(body.checks.cronJobs.failures).toBe(2);
  });

  it('returns unhealthy when a critical subsystem fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB connection refused') as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database.status).toBe('fail');
    expect(body.checks.database.note).toContain('DB connection refused');
  });

  it('reports redis as optional when not configured', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }] as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    const body = await res.json();

    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.redis.note).toContain('not configured');
  });

  it('reports email degraded when RESEND_API_KEY is missing', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    delete process.env.RESEND_API_KEY;

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }] as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health'));
    const body = await res.json();

    expect(body.checks.email.status).toBe('degraded');
    expect(body.checks.email.note).toContain('RESEND_API_KEY missing');
  });
});
