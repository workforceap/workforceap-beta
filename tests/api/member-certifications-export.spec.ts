// @vitest-environment node
/**
 * S01/P02 part 3: a member's certificate CSV shows a formula-looking
 * certificate name as text, doubles embedded quotes, and is never cached.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const prisma = {
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    userCertification: { findMany: vi.fn() },
  };
  return { prisma, getUser: vi.fn() };
});

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextResponse: MockNextResponse };
});
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));

import { GET } from '@/app/api/member/certifications/export/route';

const call = GET as unknown as () => Promise<Response>;

function dataLines(csv: string): string[] {
  return csv.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith('#'));
}

beforeEach(() => {
  h.getUser.mockReset();
  h.prisma.userCertification.findMany.mockReset();
  h.getUser.mockResolvedValue({ id: 'user-1' });
});

describe('GET /api/member/certifications/export', () => {
  it('shows a formula-looking certificate name as text', async () => {
    h.prisma.userCertification.findMany.mockResolvedValue([
      { certName: '@SUM(1)', earnedAt: new Date('2026-05-01T00:00:00.000Z') },
    ]);
    const res = await call();
    expect(res.status).toBe(200);
    const lines = dataLines(await res.text());
    expect(lines[0]).toBe('Certificate Name,Earned Date');
    expect(lines[1]).toBe("'@SUM(1),2026-05-01");
  });

  it('doubles an embedded quote so the row stays two columns', async () => {
    h.prisma.userCertification.findMany.mockResolvedValue([
      { certName: 'Google "IT" Support, Level 1', earnedAt: new Date('2026-05-02T00:00:00.000Z') },
    ]);
    const lines = dataLines(await (await call()).text());
    expect(lines[1]).toBe('"Google ""IT"" Support, Level 1",2026-05-02');
  });

  it('is sent as no-store with the same filename and keeps the branding header', async () => {
    h.prisma.userCertification.findMany.mockResolvedValue([]);
    const res = await call();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('text/csv');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="workforceap-certificates.csv"');
    const text = await res.text();
    expect(text).toContain('My Certificates');
    expect(dataLines(text)).toEqual(['Certificate Name,Earned Date']);
    expect(h.prisma.userCertification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, take: 100, select: { certName: true, earnedAt: true } }),
    );
  });

  it('returns 401 without a signed-in user', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.prisma.userCertification.findMany).not.toHaveBeenCalled();
  });
});
