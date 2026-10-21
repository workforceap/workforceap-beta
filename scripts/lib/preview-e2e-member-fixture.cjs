#!/usr/bin/env node

/**
 * Temporary DEMO fixture adjustments for signed-in Portal C Preview tests.
 * Runs only from CI after the destination guard — never during Vercel builds.
 */
const E2E_MEMBER_EMAIL = 'member-test@workforceap.org';
const PORTAL_QA_ORG_SLUG = 'portal-qa-september-smoke';
/** Serializes fixture writes for the shared DEMO test member across concurrent jobs. */
const FIXTURE_ADVISORY_LOCK_KEY = 902_901;
const MENTOR_FIXTURE_MARKER = 'Portal C temporary mentor fixture; restored by the serialized CI job.';
const BROWSE_MENTOR_EMAIL = 'portal-c-browse-mentor@workforceap.org';
const BROWSE_MENTOR_MARKER = 'Portal C temporary browse mentor fixture; restored by the serialized CI job.';
const COUNSELOR_FIXTURE_MARKER = 'Portal C temporary counselor session fixture; restored by the serialized CI job.';

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
      organizationId: true,
      assessmentCompleted: true,
      assessmentCompletedAt: true,
      notificationsUpdates: true,
      profile: { select: { city: true } },
      mentorProfile: { select: { id: true, bio: true, isActive: true, approvedAt: true, _count: { select: { sessions: true, specialties: true } } } },
      messageThreadsAsMember: { orderBy: { id: 'asc' }, select: { id: true, memberLastReadAt: true } },
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
    mentorId: user.mentorProfile?.id ?? null,
    threads: (user.messageThreadsAsMember ?? []).map((t) => ({ id: t.id, memberLastReadAt: t.memberLastReadAt?.toISOString() ?? null })),
  } };
}

function isRemovableMentorFixture(mentor) {
  return Boolean(
    mentor
    && mentor.bio === MENTOR_FIXTURE_MARKER
    && !mentor.isActive
    && !mentor.approvedAt
    && !mentor._count?.sessions
    && !mentor._count?.specialties,
  );
}

async function loadMemberMentor(prisma, memberId) {
  return prisma.mentor.findUnique({
    where: { userId: memberId },
    select: { id: true, bio: true, isActive: true, approvedAt: true, _count: { select: { sessions: true, specialties: true } } },
  });
}

async function removeLeftoverMentorFixture(prisma, member) {
  const mentor = member.mentorProfile ?? await loadMemberMentor(prisma, member.id);
  if (!mentor) return false;
  // The synthetic member must stay a plain member for /mentor/apply. Delete a
  // leftover fixture, and also any session-free mentor row the relation miss.
  if (mentor._count?.sessions || mentor._count?.specialties) {
    throw new Error('Temporary mentor has unexpected state; refusing to delete it.');
  }
  if (!isRemovableMentorFixture(mentor) && mentor.bio !== MENTOR_FIXTURE_MARKER && mentor.bio !== BROWSE_MENTOR_MARKER) {
    // Still removable when the leftover lost its marker but has no dependents.
    if (mentor.isActive || mentor.approvedAt) {
      throw new Error('Temporary mentor has unexpected state; refusing to delete it.');
    }
  }
  await prisma.mentor.delete({ where: { id: mentor.id, userId: member.id } });
  return true;
}

async function ensureBrowseMentorFixture(prisma, organizationId) {
  let user = await prisma.user.findFirst({
    where: { email: { equals: BROWSE_MENTOR_EMAIL, mode: 'insensitive' }, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { organizationId, email: BROWSE_MENTOR_EMAIL, fullName: 'Portal QA browse mentor' },
      select: { id: true },
    });
  }
  const existing = await loadMemberMentor(prisma, user.id);
  if (existing) {
    if (existing.bio !== BROWSE_MENTOR_MARKER || existing._count?.sessions || existing._count?.specialties) {
      throw new Error('Browse mentor has unexpected state; refusing to reuse it.');
    }
    if (!existing.isActive || !existing.approvedAt) {
      await prisma.mentor.update({
        where: { id: existing.id, userId: user.id },
        data: { isActive: true, approvedAt: existing.approvedAt ?? new Date() },
      });
    }
    return { created: false, mentorId: existing.id };
  }
  const created = await prisma.mentor.create({
    data: {
      userId: user.id,
      fullName: 'Portal QA browse mentor',
      title: 'Synthetic browse fixture',
      company: 'Portal QA',
      industry: 'Testing',
      bio: BROWSE_MENTOR_MARKER,
      isActive: true,
      approvedAt: new Date(),
      availableHours: 0,
    },
  });
  return { created: true, mentorId: created.id };
}

async function removeBrowseMentorFixture(prisma, organizationId) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: BROWSE_MENTOR_EMAIL, mode: 'insensitive' }, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return false;
  const mentor = await loadMemberMentor(prisma, user.id);
  if (!mentor) return false;
  if (mentor.bio !== BROWSE_MENTOR_MARKER || mentor._count?.sessions || mentor._count?.specialties) {
    throw new Error('Browse mentor has unexpected state; refusing to delete it.');
  }
  await prisma.mentor.delete({ where: { id: mentor.id, userId: user.id } });
  return true;
}

function isRemovableCounselorFixture(session) {
  return Boolean(
    session
    && session.toolType === 'career_counselor'
    && session.inputSummary === COUNSELOR_FIXTURE_MARKER
    && !session.parentToolResultId
    && !session._count?.childResults
    && !session._count?.primaryForApplicationFeedbacks,
  );
}

async function removeMarkedCounselorFixtures(prisma, memberId) {
  const sessions = await prisma.aIToolResult.findMany({
    where: { userId: memberId, toolType: 'career_counselor', inputSummary: COUNSELOR_FIXTURE_MARKER },
    select: {
      id: true,
      toolType: true,
      inputSummary: true,
      parentToolResultId: true,
      _count: { select: { childResults: true, primaryForApplicationFeedbacks: true } },
    },
  });
  for (const session of sessions) {
    if (!isRemovableCounselorFixture(session)) {
      throw new Error('Temporary counselor session has unexpected state; refusing to delete it.');
    }
    await prisma.aIToolResult.delete({ where: { id: session.id, userId: memberId } });
  }
  return sessions.length;
}

async function ensureCounselorSessionFixture(prisma, memberId) {
  const existing = await prisma.aIToolResult.findFirst({
    where: { userId: memberId, toolType: 'career_counselor' },
    select: { id: true },
  });
  if (existing) return { created: false };
  await prisma.aIToolResult.create({
    data: {
      userId: memberId,
      toolType: 'career_counselor',
      inputSummary: COUNSELOR_FIXTURE_MARKER,
      output: 'Portal QA session\n\nAction plan\n1. Review the signed-in inventory fixture.\nTranscript\n',
    },
  });
  return { created: true };
}

async function prepareMentorFixture(prisma) {
  return withFixtureLock(prisma, async (tx) => {
    const member = await findFixtureMember(tx);
    if (member.mentorProfile) return { created: false };
    await tx.mentor.create({ data: { userId: member.id, fullName: 'Portal QA mentor fixture',
      title: 'Synthetic test fixture', company: 'Portal QA', industry: 'Testing', bio: MENTOR_FIXTURE_MARKER,
      isActive: false, approvedAt: null, availableHours: 0 } });
    return { created: true };
  });
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
  let user = await findFixtureMember(prisma);
  user = { ...user, mentorProfile: user.mentorProfile ?? await loadMemberMentor(prisma, user.id) };
  if (user.mentorProfile) {
    await removeLeftoverMentorFixture(prisma, user);
    user = await findFixtureMember(prisma);
    user = { ...user, mentorProfile: user.mentorProfile ?? await loadMemberMentor(prisma, user.id) };
  }
  await ensureBrowseMentorFixture(prisma, user.organizationId);
  await ensureCounselorSessionFixture(prisma, user.id);
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
  const currentMentor = member.mentorProfile ?? await loadMemberMentor(prisma, member.id);
  if (snapshot.before.mentorId === null && currentMentor) {
    await removeLeftoverMentorFixture(prisma, { ...member, mentorProfile: currentMentor });
  }
  await removeBrowseMentorFixture(prisma, member.organizationId);
  await removeMarkedCounselorFixtures(prisma, member.id);
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
  prepareMentorFixture,
  E2E_MEMBER_EMAIL,
  PORTAL_QA_ORG_SLUG,
  findFixtureMember,
  prepareMemberForSignedInRoutes,
  restoreMemberSnapshot,
  verifyRestored,
  ensureIncompleteBaseline,
};
