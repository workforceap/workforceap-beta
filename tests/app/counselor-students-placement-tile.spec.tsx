import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * C05: the roster's "Placements, 30d" tile counts the staff placement records
 * (PlacementRecord) of the roster's members, not `placement_recorded` member
 * events. Those events are missing for admin-created and employer-hire
 * placements, and the admin placed-outcome route emits a fresh one on every
 * edit, so the event count was both short and inflated.
 */

const db = vi.hoisted(() => {
  const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
  const defaultFor = (method: string) => async () =>
    method === 'count' ? 0 : method === 'findMany' || method === 'groupBy' ? [] : null;
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({}, {
        get: (_m, method: string) => (args: unknown) =>
          (overrides[`${model}.${method}`] ?? defaultFor(method))(args),
      }),
  });
  return { prisma, overrides };
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false), isCounselor: vi.fn(async () => true) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/counselor/counselorStudentsRoster', () => ({
  loadCounselorRosterRiskAndActivity: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/attention/loadFacts', () => ({ loadAttentionFacts: vi.fn(async () => []) }));
vi.mock('@/lib/attention/evaluate', () => ({
  buildAttentionQueue: vi.fn(() => ({ members: [], onTrack: [], totals: {} })),
  selectByReason: vi.fn(() => []),
}));
vi.mock('@/lib/counselor/rosterStats', () => ({
  ROSTER_STAT_LOOKBACK_DAYS: 30,
  buildCounselorRosterStats: vi.fn(() => []),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorRosterEmpty', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/counselor/CounselorStudentsRosterClient', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorRosterStats', () => ({ default: () => null }));

import CounselorStudentsPage from '@/app/(portal)/counselor/students/page';
import { buildCounselorRosterStats } from '@/lib/counselor/rosterStats';

const member = (id: string) => ({
  id,
  fullName: `Member ${id}`,
  email: `${id}@example.com`,
  enrolledProgram: null,
  courseEnrollments: [],
  programInterest: null,
  assessmentScorePct: null,
  wioaReviewStatus: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  memberProgramProgress: [],
});

describe('counselor roster placements tile (C05)', () => {
  let placementArgs: Array<{ where?: Record<string, unknown> }>;

  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    vi.mocked(buildCounselorRosterStats).mockClear();
    placementArgs = [];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1', userId: 'staff-1' });
    db.overrides['counselorAssignment.findMany'] = async () => [
      { id: 'assign-1', memberId: 'm-1', member: member('m-1') },
      { id: 'assign-2', memberId: 'm-2', member: member('m-2') },
      { id: 'assign-3', memberId: 'm-3', member: member('m-3') },
    ];
    // Three edits of one placement plus nothing for the others: the old
    // event-based tile would read 3 here.
    db.overrides['memberEvent.count'] = async (args) =>
      JSON.stringify(args).includes('placement_recorded') ? 3 : 0;
    db.overrides['placementRecord.findMany'] = async (args) => {
      placementArgs.push(args as { where?: Record<string, unknown> });
      return [{ startDateVerified: true }, { startDateVerified: false }];
    };
  });

  it('passes the PlacementRecord count and its unverified share to the tile builder', async () => {
    renderToStaticMarkup(await CounselorStudentsPage({ searchParams: Promise.resolve({}) }));

    expect(buildCounselorRosterStats).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildCounselorRosterStats).mock.calls[0][0]).toMatchObject({
      recentPlacements: 2,
      recentPlacementsUnverified: 1,
    });
  });

  it("scopes the placement read to the roster's members and the 30-day window", async () => {
    const before = Date.now();
    renderToStaticMarkup(await CounselorStudentsPage({ searchParams: Promise.resolve({}) }));

    expect(placementArgs).toHaveLength(1);
    const where = placementArgs[0].where as { userId: { in: string[] }; placedAt: { gte: Date } };
    expect(where.userId.in.sort()).toEqual(['m-1', 'm-2', 'm-3']);
    const ageDays = (before - where.placedAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
  });
});
