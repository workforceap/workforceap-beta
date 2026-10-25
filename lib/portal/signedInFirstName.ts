import { prisma } from '@/lib/db/prisma';

/**
 * First name of the signed-in user for the person-facing greeting
 * ("Welcome back, {first name}.") on the counselor, employer and partner homes.
 *
 * Returns `undefined` when the name is unknown or the lookup is unavailable
 * (for example a test that mocks the Prisma client without the `user` model),
 * so the page keeps its workspace title instead of failing. One cheap query;
 * never throws.
 */
export async function signedInFirstName(userId: string): Promise<string | undefined> {
  const model = (prisma as { user?: { findUnique?: typeof prisma.user.findUnique } }).user;
  if (typeof model?.findUnique !== 'function') return undefined;
  try {
    const row = await model.findUnique({ where: { id: userId }, select: { fullName: true } });
    return row?.fullName?.trim().split(/\s+/)[0] || undefined;
  } catch {
    return undefined;
  }
}
