/**
 * Real-database behavioural tests for lib/auth/roles.ts (WAP-175).
 *
 * roles.ts resolves roles inside `prisma.$transaction`, so monkeypatching
 * `prisma.profile` delegates never reached the real query path; the previous
 * version of this file was permanently skipped for that reason. This suite
 * seeds rows into the disposable contract database instead and asserts on
 * what the real helpers return. It runs only in the database-contract lane
 * (`TEST_REAL_DB=1`, see scripts/run-db-contract-tests.mjs); the default
 * node:test lane still skips it because it has no PostgreSQL.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  canBypassMemberAssessment,
  isAdmin,
  isCounselor,
  isSuperAdmin,
  requireAdmin,
} from './roles';
import { prisma } from '../db/prisma';

const runId = randomUUID().slice(0, 8);
const orgSlug = `roles-contract-${runId}`;
const seeded: { orgId: string; roleIds: Record<string, string>; userIds: string[] } = { orgId: '', roleIds: {}, userIds: [] };

async function seedUser(profileRole: string | null, roleNames: string[], options: { counselor?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      organizationId: seeded.orgId,
      email: `${profileRole ?? 'norole'}-${roleNames.join('-') || 'none'}-${runId}-${randomUUID().slice(0, 6)}@example.test`,
      fullName: `Roles contract ${profileRole ?? 'no profile'}`,
    },
    select: { id: true },
  });
  seeded.userIds.push(user.id);
  if (profileRole) await prisma.profile.create({ data: { userId: user.id, role: profileRole } });
  for (const name of roleNames) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: seeded.roleIds[name] } });
  }
  if (options.counselor) await prisma.counselor.create({ data: { userId: user.id, active: true } });
  return user.id;
}

before(async () => {
  const org = await prisma.organization.create({ data: { slug: orgSlug, name: `Roles contract ${runId}` }, select: { id: true } });
  seeded.orgId = org.id;
  for (const name of ['admin', 'super_admin', 'member']) {
    const role = await prisma.role.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
    seeded.roleIds[name] = role.id;
  }
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: seeded.userIds } } });
  await prisma.organization.deleteMany({ where: { id: seeded.orgId } });
  await prisma.$disconnect();
});

test('a plain member is not an admin and requireAdmin rejects', async () => {
  const userId = await seedUser('member', []);
  assert.equal(await isAdmin(userId), false);
  assert.equal(await isSuperAdmin(userId), false);
  assert.equal(await canBypassMemberAssessment(userId), false);
  await assert.rejects(requireAdmin(userId), new Error('Forbidden: admin access required'));
});

test('a user with no profile row defaults to member', async () => {
  const userId = await seedUser(null, []);
  assert.equal(await isAdmin(userId), false);
  assert.equal(await isCounselor(userId), false);
});

test('an admin profile passes requireAdmin and may bypass member assessment', async () => {
  const userId = await seedUser('admin', []);
  assert.equal(await isAdmin(userId), true);
  assert.equal(await isSuperAdmin(userId), false);
  assert.equal(await canBypassMemberAssessment(userId), true);
  await requireAdmin(userId);
});

test('a super_admin profile is super admin, admin and counselor without a counselor row', async () => {
  const userId = await seedUser('super_admin', []);
  assert.equal(await isSuperAdmin(userId), true);
  assert.equal(await isAdmin(userId), true);
  assert.equal(await canBypassMemberAssessment(userId), true);
  assert.equal(await isCounselor(userId), true);
});

test('UserRole super_admin grants super admin even when the profile says member', async () => {
  const userId = await seedUser('member', ['super_admin']);
  assert.equal(await isSuperAdmin(userId), true);
  assert.equal(await isAdmin(userId), true);
  assert.equal(await canBypassMemberAssessment(userId), true);
});

test('UserRole admin grants admin access but not super admin', async () => {
  const userId = await seedUser('member', ['admin']);
  assert.equal(await isSuperAdmin(userId), false);
  assert.equal(await isAdmin(userId), true);
  assert.equal(await canBypassMemberAssessment(userId), true);
});

test('an active counselor row makes isCounselor true without admin access', async () => {
  const userId = await seedUser('member', [], { counselor: true });
  assert.equal(await isCounselor(userId), true);
  assert.equal(await isAdmin(userId), false);
});

test('a deactivated counselor row no longer counts', async () => {
  const userId = await seedUser('member', [], { counselor: true });
  await prisma.counselor.update({ where: { userId }, data: { active: false } });
  assert.equal(await isCounselor(userId), false);
});
