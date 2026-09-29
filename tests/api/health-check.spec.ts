import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: class extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body ?? null, init);
    }
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg as never);
    }),
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/http/clientIp', () => ({
  getClientIpFromRequest: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/http/publicApiCors', () => ({
  publicApiCorsHeaders: vi.fn(() => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkPublicHealthRateLimit: vi.fn(),
  getRateLimiterMode: vi.fn(() => 'redis'),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

// ─── Imports after mocks ───
import { GET as healthGET, OPTIONS as healthOPTIONS } from '@/app/api/health/route';
import { GET as readyGET, OPTIONS as readyOPTIONS } from '@/app/api/health/ready/route';
import { __resetReadyCache } from '@/app/api/health/ready/_readyCache';
import { prisma } from '@/lib/db/prisma';
import { checkPublicHealthRateLimit, getRateLimiterMode } from '@/lib/rate-limit';

describe('GET /api/health', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPublicHealthRateLimit).mockResolvedValue({ success: true });

    process.env = {
      ...OLD_ENV,
      VERCEL_GIT_COMMIT_SHA: 'abc123def',
      VERCEL_ENV: 'production',
      POSTGRES_PRISMA_URL: '',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns ok liveness without touching Prisma', async () => {
    const res = await healthGET(new Request('http://localhost:3000/api/health'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.probe).toBe('live');
    expect(body.version).toBe('abc123d');
    expect(body.timestamp).toBeDefined();
    expect(body.note).toMatch(/\/api\/health\/ready/);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stays liveness-only when deep=true (use /api/health/ready for deps)', async () => {
    const res = await healthGET(new Request('http://localhost:3000/api/health?deep=true'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.probe).toBe('live');
    expect(body.checks).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkPublicHealthRateLimit).mockResolvedValue({ success: false });

    const res = await healthGET(new Request('http://localhost:3000/api/health'));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });

  it('returns local version when not on Vercel', async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';

    const res = await healthGET(new Request('http://localhost:3000/api/health'));

    const body = await res.json();
    expect(body.version).toBe('local');
  });

  it('reports the Supabase project ref behind NEXT_PUBLIC_SUPABASE_URL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://esbdrgaonplpvzmtrdhw.supabase.co/';

    const res = await healthGET(new Request('http://localhost:3000/api/health'));

    const body = await res.json();
    expect(body.supabaseRef).toBe('esbdrgaonplpvzmtrdhw');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports a null Supabase ref when the URL is unset, malformed, or not a Supabase host', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    let body = await (await healthGET(new Request('http://localhost:3000/api/health'))).json();
    expect(body.supabaseRef).toBeNull();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not a url';
    body = await (await healthGET(new Request('http://localhost:3000/api/health'))).json();
    expect(body.supabaseRef).toBeNull();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://esbdrgaonplpvzmtrdhw.example.com';
    body = await (await healthGET(new Request('http://localhost:3000/api/health'))).json();
    expect(body.supabaseRef).toBeNull();
  });

  it('classifies the runtime Prisma URL without returning a connection string', async () => {
    const fixtures = [
      ['postgresql://postgres:secret@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres', 'demo'],
      ['postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3Desbdrgaonplpvzmtrdhw', 'demo'],
      ['postgresql://postgres:secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres', 'prod'],
      ['postgresql://postgres:secret@db.esbdrgaonplpvzmtrdhw.supabase.co.attacker.invalid:5432/postgres', 'unknown'],
    ] as const;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://esbdrgaonplpvzmtrdhw.supabase.co';
    for (const [url, expected] of fixtures) {
      process.env.POSTGRES_PRISMA_URL = url;
      const body = await (await healthGET(new Request('http://localhost:3000/api/health'))).json();
      expect(body.supabaseRef).toBe('esbdrgaonplpvzmtrdhw');
      expect(body.prismaProject).toBe(expected);
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(JSON.stringify(body)).not.toContain('postgresql://');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not use DATABASE_URL to attest Prisma when POSTGRES_PRISMA_URL is missing', async () => {
    delete process.env.POSTGRES_PRISMA_URL;
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.esbdrgaonplpvzmtrdhw.supabase.co/postgres';
    const body = await (await healthGET(new Request('http://localhost:3000/api/health'))).json();
    expect(body.prismaProject).toBe('unset');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('includes max-age=5 cache header', async () => {
    const res = await healthGET(new Request('http://localhost:3000/api/health'));

    expect(res.headers.get('Cache-Control')).toBe('max-age=5');
  });
});

describe('OPTIONS /api/health', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await healthOPTIONS();

    expect(res.status).toBe(204);
  });
});

describe('GET /api/health/ready', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetReadyCache();
    vi.mocked(checkPublicHealthRateLimit).mockResolvedValue({ success: true });
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ id: 'org-1' } as never);
    vi.mocked(getRateLimiterMode).mockReturnValue('redis');

    process.env = {
      ...OLD_ENV,
      VERCEL_GIT_COMMIT_SHA: 'abc123def',
      VERCEL_ENV: 'production',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns ok when the default org is reachable', async () => {
    const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.probe).toBe('ready');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.organization.status).toBe('ok');
    expect(body.checks.organization.slug).toBe('workforceap');
    expect(body.checks.organization.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('reports the rate limiter mode so operators can prove production is on Redis (WAP-13)', async () => {
    const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateLimiter).toBe('redis');
    expect(body.checks.rateLimiter).toEqual({ status: 'ok', mode: 'redis' });
  });

  it.each(['fail-open', 'fail-closed'] as const)(
    'flags a %s limiter as a warning without failing readiness (the smoke cron enforces it)',
    async (mode) => {
      vi.mocked(getRateLimiterMode).mockReturnValue(mode);
      const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.rateLimiter).toBe(mode);
      expect(body.checks.rateLimiter).toEqual({ status: 'warn', mode });
      expect(body.checks.database.status).toBe('ok');
    },
  );

  it('returns 503 when Prisma cannot reach the org', async () => {
    vi.mocked(prisma.organization.findUnique).mockRejectedValue(new Error('Connection refused'));

    const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('fail');
    expect(body.probe).toBe('ready');
    expect(body.checks.database.status).toBe('fail');
    expect(body.checks.organization.status).toBe('fail');
    expect(body.checks.organization.reason).toBe('Database unavailable');
    expect(JSON.stringify(body)).not.toContain('Connection refused');
  });

  it('returns 503 when the default org row is missing', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('fail');
    expect(body.checks.organization.reason).toMatch(/Default organization missing/);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkPublicHealthRateLimit).mockResolvedValue({ success: false });

    const res = await readyGET(new Request('http://localhost:3000/api/health/ready'));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });
});

describe('OPTIONS /api/health/ready', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await readyOPTIONS();

    expect(res.status).toBe(204);
  });
});
