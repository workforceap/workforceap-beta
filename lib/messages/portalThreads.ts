import { prisma } from '@/lib/db/prisma';

// `MessageThread.employerId` / `partnerId` are unique: two first opens of the
// same portal inbox at once (two team members, or a page render racing its
// own messages API call) must converge on one row instead of the loser
// failing with a unique violation, so the create is an upsert keyed on the
// owner column — the same shape `lib/messages/counselorThread.ts` uses for
// member threads. There is no routing to refresh on these threads, so the
// update branch only touches `updatedAt` (via @updatedAt) and returns the
// existing row.
export async function getOrCreateEmployerMessageThread(employerId: string) {
  const existing = await prisma.messageThread.findUnique({
    where: { employerId },
  });
  if (existing) return existing;
  return prisma.messageThread.upsert({
    where: { employerId },
    create: { kind: 'employer', employerId },
    update: {},
  });
}

export async function getOrCreatePartnerMessageThread(partnerId: string) {
  const existing = await prisma.messageThread.findUnique({
    where: { partnerId },
  });
  if (existing) return existing;
  return prisma.messageThread.upsert({
    where: { partnerId },
    create: { kind: 'partner', partnerId },
    update: {},
  });
}

export async function assertEmployerCanAccessThread(employerId: string, threadId: string) {
  const thread = await prisma.messageThread.findFirst({
    where: { id: threadId, employerId, kind: 'employer' },
  });
  return thread;
}

export async function assertPartnerCanAccessThread(partnerId: string, threadId: string) {
  const thread = await prisma.messageThread.findFirst({
    where: { id: threadId, partnerId, kind: 'partner' },
  });
  return thread;
}
