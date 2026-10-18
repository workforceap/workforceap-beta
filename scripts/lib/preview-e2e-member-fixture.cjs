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
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${FIXTURE_ADVISORY_LOCK_KEY})`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${FIXTURE_ADVISORY_LOCK_KEY})`);
  }
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
    where: { email: { equals: E2E_MEMBER_EMAIL, mode: 'insensitive' }, organizationId: org.id },
    select: {
      id: true,
      assessmentCompleted: true,
      assessmentCompletedAt: true,
    },
  });
  if (!user) {
    throw new Error(`Fixture member ${E2E_MEMBER_EMAIL} was not found in ${PORTAL_QA_ORG_SLUG}.`);
  }
  return user;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ userId: string, before: { assessmentCompleted: boolean, assessmentCompletedAt: string | null }, applied: boolean }>}
 */
async function prepareMemberForSignedInRoutes(prisma) {
  return withFixtureLock(prisma, async () => {
  const user = await findFixtureMember(prisma);
  const before = {
    assessmentCompleted: user.assessmentCompleted,
    assessmentCompletedAt: user.assessmentCompletedAt
      ? user.assessmentCompletedAt.toISOString()
      : null,
  };
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
  return withFixtureLock(prisma, async () => {
  if (!snapshot?.userId || !snapshot.before) {
    throw new Error('Fixture restore snapshot is missing.');
  }
  await prisma.user.update({
    where: { id: snapshot.userId },
    data: {
      assessmentCompleted: snapshot.before.assessmentCompleted,
      assessmentCompletedAt: snapshot.before.assessmentCompletedAt
        ? new Date(snapshot.before.assessmentCompletedAt)
        : null,
    },
  });
  await verifyRestored(prisma, snapshot);
  });
}

async function verifyRestored(prisma, snapshot) {
  const user = await prisma.user.findUnique({
    where: { id: snapshot.userId },
    select: { assessmentCompleted: true, assessmentCompletedAt: true },
  });
  if (!user) {
    throw new Error('Fixture member disappeared during restore verification.');
  }
  const expectedAt = snapshot.before.assessmentCompletedAt;
  const actualAt = user.assessmentCompletedAt ? user.assessmentCompletedAt.toISOString() : null;
  if (user.assessmentCompleted !== snapshot.before.assessmentCompleted || actualAt !== expectedAt) {
    throw new Error('Fixture member preassessment state did not restore cleanly.');
  }
}

/**
 * Reverse a leftover build-time completion mark so the preassessment gate
 * proof sees an incomplete member. Does not ungate the member.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureIncompleteBaseline(prisma) {
  return withFixtureLock(prisma, async () => {
    const user = await findFixtureMember(prisma);
    if (!user.assessmentCompleted && user.assessmentCompletedAt == null) {
      return { userId: user.id, changed: false };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { assessmentCompleted: false, assessmentCompletedAt: null },
    });
    return { userId: user.id, changed: true };
  });
}

module.exports = {
  E2E_MEMBER_EMAIL,
  PORTAL_QA_ORG_SLUG,
  findFixtureMember,
  prepareMemberForSignedInRoutes,
  restoreMemberSnapshot,
  verifyRestored,
  ensureIncompleteBaseline,
};
