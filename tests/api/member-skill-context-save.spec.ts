import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), save: vi.fn(), ensure: vi.fn(), skills: vi.fn(), results: vi.fn(), careers: vi.fn(), limit: vi.fn() }));
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: mocks.ensure }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: mocks.save }));
vi.mock('@/lib/rate-limit', () => ({ checkAIToolRateLimit: mocks.limit, checkInterestProfilerRateLimit: mocks.limit }));
vi.mock('@/lib/onet/client', () => ({ isOnetConfigured: () => true }));
vi.mock('@/lib/ai/onetSkills', () => ({ searchOccupations: vi.fn(), getOccupationSkills: mocks.skills, mapSkillsToRadarAxes: () => [{ axis: 'Engineering', value: 75, hasData: true }] }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ careerProgramMapping: { findMany: async () => [] } }) } }));
vi.mock('@/lib/onet/interestProfiler', () => ({ getInterestProfilerResults: mocks.results, getInterestProfilerCareers: mocks.careers }));
vi.mock('@/lib/onet/ipMapToPrograms', () => ({ mapIpCareerRowsToProgramSlugs: async () => [] }));

import { GET as getSkills } from '@/app/api/ai/skill-mapper/route';
import { POST as scoreInterests } from '@/app/api/member/interest-profiler/score/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'member-a' }); mocks.save.mockReset().mockResolvedValue('saved-owned');
  mocks.ensure.mockResolvedValue(undefined); mocks.limit.mockResolvedValue({ success: true });
  mocks.skills.mockResolvedValue([{ name: 'Troubleshooting', score: 88, importance: 'High' }]);
  mocks.results.mockResolvedValue({ result: [{ code: 'R', title: 'Realistic', score: 20 }, { code: 'I', title: 'Investigative', score: 16 }, { code: 'A', title: 'Artistic', score: 15 }, { code: 'S', title: 'Social', score: 17 }, { code: 'E', title: 'Enterprising', score: 14 }, { code: 'C', title: 'Conventional', score: 12 }] });
  mocks.careers.mockResolvedValue({ career: [{ code: '15-1232.00', title: 'User Support', fit: 'Best' }], total: 1 });
});

const cases = [
  { label: 'Skill Mapper', call: () => getSkills(new Request('https://example.test/api/ai/skill-mapper?code=15-1232.00&title=User%20Support') as NextRequest), summary: 'Skill mapper lookup (15-1232.00)', hasOutput: (data: Record<string, unknown>) => Array.isArray(data.radarAxes) },
  { label: 'Interest Profiler', call: () => scoreInterests(new Request('https://example.test/api/member/interest-profiler/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: '3'.repeat(30) }) }) as NextRequest), summary: 'Interest Profiler (30 questions)', hasOutput: (data: Record<string, unknown>) => Array.isArray(data.careers) },
];

describe.each(cases)('$label save confirmation', ({ call, summary, hasOutput }) => {
  it('returns the ID from the existing save for the authenticated member', async () => {
    const response = await call(); const body = await response.json();
    expect(response.status).toBe(200); expect(hasOutput(body)).toBe(true); expect(body.resultId).toBe('saved-owned');
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith('member-a', 'skill_assessment', summary, expect.any(String));
  });
  it('keeps the provider result usable but returns no saved ID when persistence fails', async () => {
    mocks.save.mockRejectedValue(new Error('database unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await call(); const body = await response.json();
      expect(response.status).toBe(200); expect(hasOutput(body)).toBe(true); expect(body.resultId).toBeNull();
      expect(mocks.save).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
  it('preserves authentication and rate-limit gates before providers or saves', async () => {
    mocks.getUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.skills).not.toHaveBeenCalled(); expect(mocks.results).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ id: 'member-a' }); mocks.limit.mockResolvedValue({ success: false });
    expect((await call()).status).toBe(429);
    expect(mocks.skills).not.toHaveBeenCalled(); expect(mocks.results).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
