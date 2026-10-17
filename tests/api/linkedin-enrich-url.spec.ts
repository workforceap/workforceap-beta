// @vitest-environment node
/**
 * Member LinkedIn enrich used to persist any string containing `linkedin.com`.
 * The route must refuse attacker, http, and metadata URLs before writing the
 * profile, even when enrichment itself is unconfigured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const prisma = {
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    profile: { upsert: vi.fn(async () => ({})) },
    aIToolResult: { findFirst: vi.fn(), create: vi.fn() },
  };
  return { prisma, getUser: vi.fn() };
});

vi.mock('next/server', () => {
  class MockNextRequest extends Request {}
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/member/linkedin-enrich/route';

function request(linkedinUrl: unknown) {
  return new Request('https://portal.test/api/member/linkedin-enrich', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ linkedinUrl }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ id: 'member-1' });
  vi.stubEnv('PROXYCURL_API_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/member/linkedin-enrich URL persistence', () => {
  it.each([
    'https://attacker.test/?x=linkedin.com',
    'http://www.linkedin.com/in/member/',
    'https://linkedin.com.evil.test/in/member/',
    'http://169.254.169.254/latest/meta-data/',
    'https://example.com/in/member/',
  ])('refuses %s before writing the profile', async (linkedinUrl) => {
    const response = await POST(request(linkedinUrl) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Provide a valid LinkedIn profile URL' });
    expect(h.prisma.profile.upsert).not.toHaveBeenCalled();
    expect(h.prisma.aIToolResult.create).not.toHaveBeenCalled();
  });

  it('persists a canonical https LinkedIn URL without calling an enrichment provider', async () => {
    const response = await POST(request('https://www.linkedin.com/in/member/') as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, source: 'manual_only' });
    expect(h.prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'member-1' },
      create: { userId: 'member-1', profileLinkedin: 'https://www.linkedin.com/in/member/' },
      update: { profileLinkedin: 'https://www.linkedin.com/in/member/' },
    });
    expect(h.prisma.aIToolResult.create).not.toHaveBeenCalled();
  });

  it('does not persist a refused URL for an unauthenticated caller', async () => {
    h.getUser.mockResolvedValue(null);
    const response = await POST(request('https://attacker.test/?x=linkedin.com') as never);
    expect(response.status).toBe(401);
    expect(h.prisma.profile.upsert).not.toHaveBeenCalled();
  });
});
