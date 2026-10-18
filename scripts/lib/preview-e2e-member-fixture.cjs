#!/usr/bin/env node

/**
 * Temporary DEMO fixture adjustments for signed-in Portal C Preview tests.
 * Runs only from CI after the destination guard — never during Vercel builds.
 */
const E2E_MEMBER_EMAIL = 'member-test@workforceap.org';
const PORTAL_QA_ORG_SLUG = 'portal-qa-september-smoke';
/** Serializes fixture writes for the shared DEMO test member across concurrent jobs. */
const FIXTURE_ADVISORY_LOCK_KEY = 902_901;

async function withFixtureLock(prisma, fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${FIXTURE_ADVISORY_LOCK_KEY})`);
    return fn(tx);
  });
}

async function findFixtureMember(prisma) {
  const org = await prisma.organization.findFirst({
    where: { slug: PORTAL_QA_ORG_SLUG, active: true },
    select: { id: true },
  });
  if (!org) {
    throw new Error(`Fixture organization ${PORTAL_QA_ORG_SLUG} was not found on DEMO.`);
  }
  const user = await prisma.user.findFirst({
    where: { email: { equals: E2E_MEMBER_EMAIL, mode: 'insensitive' }, organizationId: org.id, deletedAt: null, profile: { role: 'member' } },
    select: {
      id: true,
      assessmentCompleted: true,
      assessmentCompletedAt: true,
      notificationsUpdates: true,
      profile: { select: { city: true } },
      messageThreadsAsMember: { select: { id: true, memberLastReadAt: true } },
    },
  });
  if (!user) {
    throw new Error(`Fixture member ${E2E_MEMBER_EMAIL} was not found in ${PORTAL_QA_ORG_SLUG}.`);
  }
  return user;
}

function snapshotOf(user) {
  return { userId: user.id, before: {
    assessmentCompleted: user.assessmentCompleted,
    assessmentCompletedAt: user.assessmentCompletedAt?.toISOString() ?? null,
    notificationsUpdates: user.notificationsUpdates,
    city: user.profile?.city ?? null,
    threads: (user.messageThreadsAsMember ?? []).map((t) => ({ id: t.id, memberLastReadAt: t.memberLastReadAt?.toISOString() ?? null })),
  } };
}

async function snapshotMember(prisma) {
  return withFixtureLock(prisma, async (tx) => snapshotOf(await findFixtureMember(tx)));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ userId: string, before: { assessmentCompleted: boolean, assessmentCompletedAt: string | null }, applied: boolean }>}
 */
async function prepareMemberForSignedInRoutes(prisma) {
  return withFixtureLock(prisma, async (prisma) => {
  const user = await findFixtureMember(prisma);
  const { before } = snapshotOf(user);
  if (user.assessmentCompleted) {
    return { userId: user.id, before, applied: false };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      assessmentCompleted: true,
      assessmentCompletedAt: user.assessmentCompletedAt ?? new Date(),
    },
  });
  return { userId: user.id, before, applied: true };
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, before: { assessmentCompleted: boolean, assessmentCompletedAt: string | null } }} snapshot
 */
async function restoreMemberSnapshot(prisma, snapshot) {
  return withFixtureLock(prisma, async (prisma) => {
  if (!snapshot?.userId || !snapshot.before) {
    throw new Error('Fixture restore snapshot is missing.');
  }
  const member = await findFixtureMember(prisma);
  if (member.id !== snapshot.userId) throw new Error('Restore target is not the synthetic test member.');
  await prisma.user.update({
    where: { id: snapshot.userId },
    data: {
      assessmentCompleted: snapshot.before.assessmentCompleted,
      assessmentCompletedAt: snapshot.before.assessmentCompletedAt
        ? new Date(snapshot.before.assessmentCompletedAt)
        : null,
    },
  });
  if (typeof snapshot.before.notificationsUpdates === 'boolean') {
    await prisma.user.update({ where: { id: member.id }, data: { notificationsUpdates: snapshot.before.notificationsUpdates } });
    await prisma.profile.update({ where: { userId: member.id }, data: { city: snapshot.before.city } });
    const allowed = new Set((member.messageThreadsAsMember ?? []).map((t) => t.id));
    for (const thread of snapshot.before.threads) {
      if (!allowed.has(thread.id)) throw new Error('Restore thread does not belong to the test member.');
      await prisma.messageThread.update({ where: { id: thread.id, memberId: member.id }, data: { memberLastReadAt: thread.memberLastReadAt ? new Date(thread.memberLastReadAt) : null } });
    }
  }
  await verifyRestored(prisma, snapshot);
  });
}

async function verifyRestored(prisma, snapshot) {
  const user = await findFixtureMember(prisma);
  if (!user) {
    throw new Error('Fixture member disappeared during restore verification.');
  }
  const expectedAt = snapshot.before.assessmentCompletedAt;
  const actualAt = user.assessmentCompletedAt ? user.assessmentCompletedAt.toISOString() : null;
  if (user.assessmentCompleted !== snapshot.before.assessmentCompleted || actualAt !== expectedAt) {
    throw new Error('Fixture member preassessment state did not restore cleanly.');
  }
  if (typeof snapshot.before.notificationsUpdates === 'boolean' && JSON.stringify(snapshotOf(user).before) !== JSON.stringify(snapshot.before)) throw new Error('Fixture profile, notifications or thread state did not restore cleanly.');
}

/**
 * Reverse a leftover build-time completion mark so the preassessment gate
 * proof sees an incomplete member. Does not ungate the member.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureIncompleteBaseline(prisma) {
  return withFixtureLock(prisma, async (prisma) => {
    const user = await findFixtureMember(prisma);
    const snapshot = snapshotOf(user);
    if (!user.assessmentCompleted && user.assessmentCompletedAt == null) {
      return { userId: user.id, changed: false, snapshot };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { assessmentCompleted: false, assessmentCompletedAt: null },
    });
    return { userId: user.id, changed: true, snapshot };
  });
}

module.exports = {
  snapshotMember,
  E2E_MEMBER_EMAIL,
  PORTAL_QA_ORG_SLUG,
  findFixtureMember,
  prepareMemberForSignedInRoutes,
  restoreMemberSnapshot,
  verifyRestored,
  ensureIncompleteBaseline,
};
