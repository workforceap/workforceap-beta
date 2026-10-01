import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COURSERA_SYNC_MEMBER_CAP,
  COURSERA_SYNC_MEMBER_PAGE_SIZE,
  fetchEligibleCourseraMembers,
} from './syncMembers';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_OR_DOGFOOD_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';

test('fetchEligibleCourseraMembers pages beyond the first 100 users', async (t) => {
  const userDelegate = (prisma as any).user;
  const originalFindMany = userDelegate.findMany;
  const originalTransaction = (prisma as any).$transaction;

  t.after(() => {
    userDelegate.findMany = originalFindMany;
    (prisma as any).$transaction = originalTransaction;
  });

  const firstPage = Array.from({ length: COURSERA_SYNC_MEMBER_PAGE_SIZE }, (_, i) => ({
    id: `user-${i + 1}`,
    email: `user-${i + 1}@example.com`,
    enrolledProgram: 'cybersecurity',
  }));
  const secondPage = [{ id: 'user-101', email: 'user-101@example.com', enrolledProgram: 'cybersecurity' }];
  const calls: any[] = [];

  userDelegate.findMany = async (args: any) => {
    calls.push(args);
    return args.skip === 0 ? firstPage : secondPage;
  };
  // fetchEligibleCourseraMembers wraps its paginated read in prisma.$transaction
  // so the RLS/GUC middleware applies (see lib/db/prisma.ts) -- mock it to just
  // invoke the callback with the same mocked delegate as `tx`.
  (prisma as any).$transaction = async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ user: userDelegate });

  const members = await fetchEligibleCourseraMembers();

  assert.equal(members.length, 101);
  assert.equal(members.at(-1)?.id, 'user-101');
  assert.deepEqual(calls.map((call) => call.skip), [0, COURSERA_SYNC_MEMBER_PAGE_SIZE]);
  assert.ok(calls.every((call) => call.take === COURSERA_SYNC_MEMBER_PAGE_SIZE));
});

test('fetchEligibleCourseraMembers stops at COURSERA_SYNC_MEMBER_CAP', async (t) => {
  const userDelegate = (prisma as any).user;
  const originalFindMany = userDelegate.findMany;
  const originalTransaction = (prisma as any).$transaction;

  t.after(() => {
    userDelegate.findMany = originalFindMany;
    (prisma as any).$transaction = originalTransaction;
  });

  const fullPage = Array.from({ length: COURSERA_SYNC_MEMBER_PAGE_SIZE }, (_, i) => ({
    id: `cap-${i}`,
    email: `cap-${i}@example.com`,
    enrolledProgram: 'cybersecurity',
  }));
  const calls: any[] = [];

  userDelegate.findMany = async (args: any) => {
    calls.push(args);
    return fullPage;
  };
  (prisma as any).$transaction = async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ user: userDelegate });

  const members = await fetchEligibleCourseraMembers();

  assert.equal(members.length, COURSERA_SYNC_MEMBER_CAP);
  assert.equal(calls.length, COURSERA_SYNC_MEMBER_CAP / COURSERA_SYNC_MEMBER_PAGE_SIZE);
  assert.ok(calls.every((call) => call.take <= COURSERA_SYNC_MEMBER_PAGE_SIZE));
});

test('fetchEligibleCourseraMembers reads members by the one member definition plus dogfood admins', async (t) => {
  const userDelegate = (prisma as any).user;
  const originalFindMany = userDelegate.findMany;
  const originalTransaction = (prisma as any).$transaction;

  t.after(() => {
    userDelegate.findMany = originalFindMany;
    (prisma as any).$transaction = originalTransaction;
  });

  const calls: any[] = [];
  userDelegate.findMany = async (args: any) => {
    calls.push(args);
    return [];
  };
  (prisma as any).$transaction = async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ user: userDelegate });

  await fetchEligibleCourseraMembers();

  assert.equal(calls.length, 1);
  // #2457 follow-up: the sync used to gate on `profile.role IN (member, admin,
  // super_admin) OR no profile`, its own definition of a member. It is the role
  // half of MEMBER_OR_DOGFOOD_WHERE now, so a user_roles-only member the funder
  // counts report is synced too, and a counselor holding the baseline member
  // row is not. No fixture-email exclusion: QA learners need syncing.
  assert.deepEqual(calls[0].where, {
    deletedAt: null,
    email: { not: '' },
    NOT: MEMBER_OR_DOGFOOD_ROLE_NOT,
  });
  assert.equal('OR' in calls[0].where, false);
  assert.equal('profile' in calls[0].where, false);
});
