import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMemberExportWhere, fetchMembersForExport } from './_membersExportQuery';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

function member(overrides: Record<string, unknown>) {
  return {
    id: 'member',
    fullName: 'Test Member',
    email: 'member@example.com',
    phone: null,
    enrolledProgram: null,
    enrolledAt: null,
    assessmentCompleted: false,
    memberProgramProgress: [],
    courseProgress: [],
    assessmentScorePct: null,
    pipelineBoardStage: null,
    wioaQualificationJson: null,
    wioaReviewStatus: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    profile: {
      state: 'TX',
      city: null,
      zip: null,
      educationLevel: null,
      employmentStatus: null,
      veteranStatus: null,
      householdIncome: null,
      dob: null,
      ethnicity: null,
    },
    placementRecord: null,
    userCertifications: [],
    applications: [],
    courseEnrollments: [],
    trainingAccessRequests: [],
    ...overrides,
  };
}

test('buildMemberExportWhere pushes state and Coursera filters into Prisma where', () => {
  const where = buildMemberExportWhere({
    state: 'TX',
    courseraStatus: 'ACTIVE',
  });

  assert.deepEqual(where.AND, [
    MEMBER_ONLY_WHERE,
    { profile: { state: 'TX' } },
    {
      trainingAccessRequests: {
        some: { providerKey: 'coursera', status: 'ACTIVE' },
      },
    },
  ]);
});

test('fetchMembersForExport keeps paging until late computed-stage matches are included', async () => {
  const pages = [
    [member({ id: 'first', createdAt: new Date('2026-01-03T00:00:00.000Z') })],
    [
      member({
        id: 'late-match',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        enrolledProgram: 'it-support',
        enrolledAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ],
    [],
  ];
  const calls: unknown[] = [];
  const db = {
    user: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return pages.shift() ?? [];
      },
    },
  };

  const result = await fetchMembersForExport(db as never, {}, 'enrolled', 1, 1);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, 'late-match');
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 3);
});
