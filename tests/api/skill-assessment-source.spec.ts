import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  create: vi.fn(), mappings: vi.fn(), trackEvent: vi.fn(), getUser: vi.fn(),
  ensureUserInDb: vi.fn(), saveAIToolResult: vi.fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: h.ensureUserInDb }));
vi.mock('@/lib/events/track', () => ({ trackEvent: h.trackEvent }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: h.saveAIToolResult }));
vi.mock('@/lib/onet/client', () => ({ isOnetConfigured: () => false }));
vi.mock('@/lib/rate-limit', () => ({ checkAIToolRateLimit: async () => ({ success: true }) }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {} }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $transaction: async (callback: (tx: unknown) => unknown) => callback({ aIToolResult: { create: h.create }, careerProgramMapping: { findMany: h.mappings } }),
} }));

import { POST } from '@/app/api/member/skill-assessment/route';
import { GET } from '@/app/api/ai/skill-mapper/route';

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ id: 'member-1' });
  h.create.mockResolvedValue({ id: 'result-1', createdAt: new Date('2026-09-19T12:00:00Z') });
  h.mappings.mockResolvedValue([]);
});

describe('assessment event sources', () => {
  it('saves a member skill result with the canonical source while preserving its payload', async () => {
    const response = await POST(new Request('http://localhost/api/member/skill-assessment', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        occupationTitle: 'Software Developers', occupationCode: '15-1252.00',
        radarAxes: [{ axis: 'Technology', value: 70, maxValue: 100 }],
        skills: [{ id: 'skill-1', name: 'Programming', score: 70, category: 'skill' }],
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, resultId: 'result-1' });
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'member-1', toolType: 'skill_assessment' }) }));
    expect(h.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'ai_tool_result_saved', sourcePage: '/dashboard/assessment' }));
  });

  it('records a demo occupation lookup against the same canonical assessment source without a provider call', async () => {
    const response = await GET(new Request('http://localhost/api/ai/skill-mapper?code=15-1252.00') as NextRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ demo: true, occupationCode: '15-1252.00' });
    expect(h.saveAIToolResult).toHaveBeenCalledOnce();
    expect(h.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'ai_tool_run_completed', sourcePage: '/dashboard/assessment' }));
  });
});
