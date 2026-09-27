// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getUser: vi.fn(), activeWrite: vi.fn(), transaction: vi.fn(),
  profileUpsert: vi.fn(), resultCreate: vi.fn(), findFirst: vi.fn(),
  state: { pending: false, inWrite: false, inReadTransaction: false },
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: h.transaction } }));
vi.mock('@/lib/ai/activeMemberWrite', () => ({ withActiveMemberAIWrite: h.activeWrite }));
vi.mock('@/lib/http/safeOutboundFetch', () => ({
  assertPublicHttpUrl: (value: string) => new URL(value),
  UnsafeUrlError: class UnsafeUrlError extends Error {},
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/member/linkedin-enrich/route';

function request(): NextRequest {
  return new Request('http://localhost/api/member/linkedin-enrich', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ linkedinUrl: 'https://www.linkedin.com/in/member' }),
  }) as NextRequest;
}

beforeEach(() => {
  vi.resetAllMocks();
  h.state.pending = false;
  h.state.inWrite = false;
  h.state.inReadTransaction = false;
  h.getUser.mockResolvedValue({ id: 'member-1' });
  h.profileUpsert.mockResolvedValue({});
  h.resultCreate.mockResolvedValue({ id: 'result-1' });
  h.findFirst.mockResolvedValue(null);
  h.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    h.state.inReadTransaction = true;
    try {
      return await callback({ aIToolResult: { findFirst: h.findFirst } });
    } finally {
      h.state.inReadTransaction = false;
    }
  });
  h.activeWrite.mockImplementation(async (_userId: string, callback: (tx: unknown) => Promise<unknown>) => {
    if (h.state.pending) throw new Error('This account is no longer active.');
    h.state.inWrite = true;
    try {
      return await callback({ profile: { upsert: h.profileUpsert }, aIToolResult: { create: h.resultCreate } });
    } finally {
      h.state.inWrite = false;
    }
  });
  vi.stubEnv('PROXYCURL_API_KEY', 'test-proxycurl-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('LinkedIn enrichment and member deletion', () => {
  it('performs network I/O between short guarded URL and result writes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      expect(h.state.inWrite).toBe(false);
      expect(h.state.inReadTransaction).toBe(false);
      return new Response(JSON.stringify({ skills: [{ name: 'TypeScript' }] }), { status: 200 });
    }));

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: 'proxycurl', skillCount: 1 });
    expect(h.activeWrite).toHaveBeenCalledTimes(2);
    expect(h.activeWrite).toHaveBeenNthCalledWith(1, 'member-1', expect.any(Function));
    expect(h.activeWrite).toHaveBeenNthCalledWith(2, 'member-1', expect.any(Function));
    expect(h.profileUpsert).toHaveBeenCalledOnce();
    expect(h.resultCreate).toHaveBeenCalledOnce();
  });

  it('does not store the fetched private profile if deletion began during Proxycurl', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      expect(h.state.inWrite).toBe(false);
      expect(h.state.inReadTransaction).toBe(false);
      h.state.pending = true;
      return new Response(JSON.stringify({ skills: [{ name: 'Private Skill' }] }), { status: 200 });
    }));

    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(h.profileUpsert).toHaveBeenCalledOnce();
    expect(h.activeWrite).toHaveBeenCalledTimes(2);
    expect(h.resultCreate).not.toHaveBeenCalled();
  });
});
