import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { aIToolResult: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/db/prisma';
import { fetchInterviewPrepBundle } from '@/lib/member/interviewPrepBundle';

const row = (toolType: string, output: string, createdAt: string, id = toolType) => ({
  id,
  userId: 'member-1',
  toolType,
  output,
  createdAt: new Date(createdAt),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchInterviewPrepBundle', () => {
  it('keeps the newest row per tool type and sorts by the published priority', async () => {
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([
      row('interview_practice', 'later interview', '2026-11-04T12:00:00Z'),
      row('resume_rewriter', 'resume v2', '2026-11-03T12:00:00Z'),
      row('interview_practice', 'older interview', '2026-10-01T12:00:00Z', 'old-interview'),
      row('career_counselor', 'elevator pitch', '2026-11-02T12:00:00Z'),
    ] as never);

    const bundle = await fetchInterviewPrepBundle('member-1');
    const query = vi.mocked(prisma.aIToolResult.findMany).mock.calls[0][0] as {
      take: number;
      where: { userId: string; toolType: { in: string[] } };
    };
    expect(query.take).toBe(500);
    expect(query.where.userId).toBe('member-1');
    expect(query.where.toolType.in).toContain('career_counselor');
    expect(query.where.toolType.in).not.toContain('skill_assessment');
    expect(bundle.empty).toBe(false);
    expect(bundle.items.map((item) => item.toolType)).toEqual([
      'career_counselor',
      'resume_rewriter',
      'interview_practice',
    ]);
    expect(bundle.items.find((item) => item.toolType === 'interview_practice')?.content).toBe('later interview');
  });

  it('marks an empty bundle when the member has no matching tool results', async () => {
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([]);
    await expect(fetchInterviewPrepBundle('member-1')).resolves.toMatchObject({ items: [], empty: true });
  });
});
