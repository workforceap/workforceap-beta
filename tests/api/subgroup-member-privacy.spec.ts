import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'leader-1' } as { id: string } | null,
  subgroups: [{ subgroupId: 'subgroup-1', subgroup: { id: 'subgroup-1', name: 'Example group', type: 'church' } }] as Array<{
    subgroupId: string;
    subgroup: { id: string; name: string; type: string };
  }>,
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => h.user) }));
vi.mock('@/lib/auth/roles', () => ({ getSubgroupsForUser: vi.fn(async () => h.subgroups) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      memberSubgroup: { findFirst: h.findFirst, findMany: h.findMany },
    }),
  },
}));

import { GET as detailGET } from '@/app/api/subgroup/members/[id]/route';
import { GET as listGET } from '@/app/api/subgroup/members/route';
import { GET as dashboardGET } from '@/app/api/subgroup/dashboard/route';

const placedAt = new Date('2026-09-01T00:00:00.000Z');
const member = {
  id: 'member-1',
  fullName: 'Example Member',
  email: 'member@example.invalid',
  phone: '555-0100',
  enrolledProgram: null,
  courseEnrollments: [],
  enrolledAt: null,
  updatedAt: placedAt,
  deletedAt: null,
  assessmentCompleted: false,
  profile: { profileLinkedin: 'https://example.invalid/member' },
  placementRecord: {
    employerName: 'Example Employer',
    jobTitle: 'Technician',
    placedAt,
    salaryOffered: 78000,
    notes: 'Internal placement note',
  },
  userCertifications: [],
  applications: [],
  memberProgramProgress: [],
  courseProgress: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'leader-1' };
  h.subgroups = [{ subgroupId: 'subgroup-1', subgroup: { id: 'subgroup-1', name: 'Example group', type: 'church' } }];
  // Deliberately return an overcomplete object: the route must serialize only
  // approved fields even if a future query or mock includes private columns.
  h.findFirst.mockResolvedValue({ member });
  h.findMany.mockResolvedValue([{ member }]);
});

describe('subgroup leader member responses', () => {
  it('omits phone and salary from detail while preserving a placement summary', async () => {
    const response = await detailGET(new Request('http://localhost/api/subgroup/members/member-1'), {
      params: Promise.resolve({ id: 'member-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('phone');
    expect(body.placementRecord).toEqual({
      employerName: 'Example Employer',
      jobTitle: 'Technician',
      placedAt: placedAt.toISOString(),
    });
    expect(body.stage).toBe('Placed');
    expect(h.findFirst.mock.calls[0][0].where).toEqual({
      memberId: 'member-1', subgroupId: { in: ['subgroup-1'] },
    });
    const select = h.findFirst.mock.calls[0][0].include.member.select;
    expect(select).not.toHaveProperty('phone');
    expect(select.placementRecord.select).toEqual({ employerName: true, jobTitle: true, placedAt: true });
  });

  it('omits salary from every list member and never queries it', async () => {
    const response = await listGET(new Request('http://localhost/api/subgroup/members'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).not.toHaveProperty('phone');
    expect(body.members[0].placementRecord).toEqual({
      employerName: 'Example Employer',
      jobTitle: 'Technician',
      placedAt: placedAt.toISOString(),
    });
    expect(body.members[0].stage).toBe('Placed');
    expect(h.findMany.mock.calls[0][0].where).toEqual({ subgroupId: { in: ['subgroup-1'] } });
    expect(h.findMany.mock.calls[0][0].include.member.select.placementRecord.select)
      .toEqual({ employerName: true, jobTitle: true, placedAt: true });
  });

  it('loads only placement existence for dashboard counts', async () => {
    const response = await dashboardGET(new Request('http://localhost/api/subgroup/dashboard'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stats).toMatchObject({ total: 1, placed: 1, active: 0 });
    expect(h.findMany.mock.calls[0][0].include.member.select.placementRecord.select)
      .toEqual({ id: true });
  });

  it('does not return a member outside the leader\'s assigned subgroup', async () => {
    h.findFirst.mockResolvedValue(null);
    const response = await detailGET(new Request('http://localhost/api/subgroup/members/other-member'), {
      params: Promise.resolve({ id: 'other-member' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Member not found in your subgroup' });
  });
});
