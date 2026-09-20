import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    $queryRaw: vi.fn(),
    cronExecution: { findFirst: vi.fn(), count: vi.fn() },
    webhookEvent: { count: vi.fn(), findFirst: vi.fn() },
    xapiStatement: { count: vi.fn() },
    aIToolResult: { count: vi.fn() },
    workflowDiagnostic: { count: vi.fn() },
    emailSendLog: { count: vi.fn() },
    pushSubscription: { count: vi.fn() },
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () {
    return { ping: vi.fn(async () => 'PONG') };
  }),
}));

import { GET } from '@/app/api/admin/health/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

describe('debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  });

  it('logs body', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }] as any);
    vi.mocked(prisma.cronExecution.findFirst).mockResolvedValue({ startedAt: new Date(), status: 'SUCCESS', jobName: 'test-job' } as any);
    vi.mocked(prisma.cronExecution.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.xapiStatement.count).mockResolvedValue(0);
    vi.mocked(prisma.aIToolResult.count).mockResolvedValue(100);
    vi.mocked(prisma.workflowDiagnostic.count).mockResolvedValue(0);
    vi.mocked(prisma.emailSendLog.count).mockResolvedValue(0);
    vi.mocked(prisma.pushSubscription.count).mockResolvedValue(0);
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost:3000/api/admin/health/debug'));
    const body = await res.json();
    console.log(JSON.stringify(body.checks, null, 2));
    expect(body.status).toBe('healthy');
  });
});
