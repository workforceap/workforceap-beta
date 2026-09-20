import { describe, expect, it, vi } from 'vitest';

/**
 * GDPR export represents a placement survey that was never accepted by the
 * provider as `sentAt: null` — never an epoch date.
 */
vi.mock('@/lib/db/prisma', () => {
  const delegates = new Map<string, Record<string, unknown>>();
  const prisma = new Proxy(
    {},
    {
      get(_target, model: string) {
        if (!delegates.has(model)) {
          delegates.set(model, {
            findMany: vi.fn(async () => []),
            findUnique: vi.fn(async () => null),
            findFirst: vi.fn(async () => null),
          });
        }
        return delegates.get(model);
      },
    },
  );
  return { prisma };
});

import { buildMemberExport } from '@/lib/member/exportData';
import { prisma } from '@/lib/db/prisma';

const member = {
  id: 'user-1',
  email: 'member@example.com',
  fullName: 'Member One',
  phone: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  organization: { id: 'org-1', name: 'Org', slug: 'org' },
  userRoles: [],
  profile: null,
};

describe('buildMemberExport placement surveys', () => {
  it('exports a pre-acceptance survey with sentAt null and never as the epoch', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member as any);
    vi.mocked(prisma.placementSurvey.findMany).mockResolvedValue([
      {
        id: 'ps-1',
        wave: 'thirty_day',
        sentAt: null,
        completedAt: null,
        jobSatisfaction: null,
        trainingRelevance: null,
        supportQuality: null,
        whatHelpedMost: null,
        whatCouldImprove: null,
        stillEmployed: null,
        currentSalary: null,
        allowTestimonial: false,
      },
      {
        id: 'ps-2',
        wave: 'ninety_day',
        sentAt: new Date('2026-05-01T12:00:00Z'),
        completedAt: new Date('2026-05-03T12:00:00Z'),
        jobSatisfaction: 5,
        trainingRelevance: 4,
        supportQuality: 5,
        whatHelpedMost: 'Coaching',
        whatCouldImprove: null,
        stillEmployed: true,
        currentSalary: 52000,
        allowTestimonial: true,
      },
    ] as any);

    const exported = await buildMemberExport('user-1');

    expect(prisma.placementSurvey.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(exported.placementSurveys).toHaveLength(2);
    expect(exported.placementSurveys[0]).toMatchObject({ id: 'ps-1', sentAt: null, completedAt: null });
    expect(exported.placementSurveys[1]).toMatchObject({
      id: 'ps-2',
      sentAt: '2026-05-01T12:00:00.000Z',
      completedAt: '2026-05-03T12:00:00.000Z',
    });
    expect(JSON.stringify(exported.placementSurveys)).not.toMatch(/1970-01-01/);
  });
});
