import { isAdmin, isCounselor, isEmployer, isPartner } from '@/lib/auth/roles';
import type { HelpAccess } from './assistant';

/**
 * Which portals the caller may be helped with, resolved server-side from the
 * same role helpers the portal layouts use. A single lookup failure degrades
 * that portal to "no", never to a throw: the assistant then answers as the
 * lowest persona it can prove, which is the safe direction.
 */
export async function resolveHelpAccess(userId: string): Promise<HelpAccess> {
  const safe = (check: Promise<boolean>) => check.catch(() => false);
  const [admin, counselor, employer, partner] = await Promise.all([
    safe(isAdmin(userId)),
    safe(isCounselor(userId)),
    safe(isEmployer(userId)),
    safe(isPartner(userId)),
  ]);
  return { admin, counselor, employer, partner };
}
